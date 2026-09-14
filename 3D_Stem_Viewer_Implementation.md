# 3D Stem Viewer — Implementation Notes

This document explains how the optional 3D stem view was added alongside the
existing 2D canvas diagram in the bucking trainer. It covers the data model,
the geometry construction, the camera/orbit math, the cut-interaction model,
the visual-legibility fixes that followed real user testing, and known
limitations.

All of the code described here lives in `script.js` (the 3D module runs from
roughly line 1880 to the end of the file) plus small additions in
`index.html` and `style.css`. Nothing here touches the scoring/DP code —
the 3D view is a second renderer over the same `currentTree` / `currentDefects`
/ `cuts` state the 2D canvas already uses.

---

## Why a Second Renderer, Not a Replacement

The 2D canvas (`drawLogGraphic`, `script.js:686`) is fast, precise, and
already tuned for the scoring workflow. Rewriting it in 3D outright would
have thrown away that maturity for a visual upgrade. Instead, the 3D view is
an **opt-in alternative renderer**:

- A `viewMode` global (`'2d'` | `'3d'`) selects which canvas is visible.
- Default is `'2d'` — nothing changes for a user who never touches the new
  dropdown.
- Both renderers read the same `currentTree`, `currentDefects`, `cuts`, and
  `logRotation` state and write back to the same `cuts` array, so switching
  views mid-session is safe and scoring is unaffected.

```js
document.getElementById('viewModeSelect').addEventListener('change', event => {
    viewMode = event.target.value;
    const is3D = viewMode === '3d';
    canvas.style.display       = is3D ? 'none' : 'block';
    stem3dCanvas.style.display = is3D ? 'block' : 'none';
    ...
    if (is3D) initStem3D();       // lazy — only pays the Three.js cost if used
    setStem3DActive(is3D);        // starts/stops the render loop
    resizeCanvases();
    redrawCanvases();
});
```

`redrawCanvases()` (`script.js:481`) is the single fork point:

```js
function redrawCanvases() {
    if (viewMode === '3d') {
        updateStem3D();
    } else {
        drawLogGraphic(ctx, canvas, cuts);
        drawHoverGuide(ctx, canvas);
    }
    drawFaceMap(faceCtx, faceCanvas, currentDefects, cuts);
}
```

The face-defect map strip stays 2D and visible in both modes — it's a good
analytical minimap regardless of how the main stem is rendered.

Three.js is loaded from cdnjs (`index.html:8`, pinned at r128) via a plain
`<script>` tag, no build step or bundler involved.

---

## Data Model

### What the 2D view already had

`currentTree` carries `{ length, butt, top, defects[] }`; `currentDefects[]`
entries look like:

```js
{ type, label, color, startFt, endFt, facesAffected: [0-3], widthIn?, facePenalty }
```

The 2D view draws the stem as a **straight linear taper** between `butt` and
`top` diameter — it never used the mill study's actual per-height diameter
measurements, and represented sweep as a cosmetic sine-wave offset
(`getCrookOffset`, `script.js:670`) sized only by `widthIn`, not by the
stem's real measured curve.

### What the mill-study source actually has

The mill-study JSON (`hw-stems/Millstudy_Stems.json`) carries much richer
data per stem that the 2D pipeline was discarding:

```json
"profile": [
  { "heightFt": 0,    "diameterIn": 19.6 },
  { "heightFt": 10.6, "diameterIn": 15   },
  ...
],
"meta": {
  "shapeDefects": [
    { "type": "sweep", "startHeightFt": 0, "lengthFt": 10.6,
      "curvePoints": [ { "heightFt": 0, "lateralOffsetIn": 0 }, ... ] }
  ]
}
```

`normalizeMillStudyStem()` (`script.js:180`) is where mill-study stems get
reshaped into the game's common schema. It now also carries this real data
through instead of discarding it:

```js
// script.js:180 (normalizeMillStudyStem, additions near the return)
const profile = (stem.profile || []).map(p => ({ h: p.heightFt, d: p.diameterIn }));
const sweepCurve = [];
(stem.meta?.shapeDefects || []).forEach(def => {
    (def.curvePoints || []).forEach(cp => sweepCurve.push({ h: cp.heightFt, off: cp.lateralOffsetIn }));
});
const sweepCurveDeduped = sweepCurve.filter((p, i) => i === 0 || Math.abs(p.h - sweepCurve[i - 1].h) > 1e-6);

return {
    ...
    profile,
    sweepCurve: sweepCurveDeduped,
};
```

(The dedup step exists because adjacent shape-defect segments repeat their
shared boundary height — e.g. log 1 ends and log 2 begins at the same
10.6 ft mark — so the raw concatenation has a duplicate point there.)

For the HW Buck / synthetic / randomly-generated datasets, `profile` and
`sweepCurve` are simply absent (`undefined`), and the 3D geometry code falls
back to the same linear-taper + sine-bump model the 2D view has always used
(see `stem3DDiameterAt` / `stem3DSweepOffsetInAt` below). This means every
dataset renders in 3D, but only mill-study stems get *true* taper and sweep
geometry — the others get a reasonable approximation built from the same
numbers the 2D view already relies on.

---

## Coordinate Convention

The stem's long axis is **world X**, with **butt at x=0** and **top at
x=totalLength** — feet are used directly as world units. This matches the
2D canvas's existing convention (`ft * scale` for the x pixel coordinate),
so a cut position computed in one view is meaningful in the other without
conversion.

Radius and sweep offset are computed in inches and divided by 12 to become
feet (`FT2IN = 12`, `script.js:2067`). The circular cross-section of the log
lives in the **Y-Z plane** at each X; sweep bends the centerline in **+Y**
(vertical, so a side-on camera view reads the bend as an up/down wave).

### Orthographic, not perspective — and why

The first version used a `THREE.PerspectiveCamera` framed close enough
(roughly `totalLength * 0.9` away, 38° FOV) to fit a 30-50 ft stem
end-to-end. That's genuinely too close for a wide FOV on something that
long: perspective foreshortens points farther from the camera more than
closer ones, and with the camera centered on the stem's midpoint, both ends
are the farthest points in the scene. The result was real — not a geometry
bug — but read as the log's ends being pinched/bowed inward, like a barrel
distortion (reported directly: *"the end of the logs are weird, not drawn
right"*).

Switched to `THREE.OrthographicCamera`. Orthographic projection has no
notion of distance affecting size — every point at a given world position
maps to the same screen position regardless of how far the camera sits
along its viewing direction — so radius and spacing stay visually true
along the entire length, and the "ends look pinched" artifact disappears
entirely. This also happens to be the right tool for the job independent of
the bug: elevation/technical views (the kind where you're meant to read off
a dimension) use orthographic projection for exactly this reason.

A second, related complaint (*"the scaling of the length and diameter
markers... don't scale when you zoom in"*) had the same root: zoom was
previously implemented as moving the perspective camera's distance, which
*does* change apparent size, but not obviously or uniformly enough to read
as "zoom." Under the orthographic camera, zoom is instead a single
`camera.zoom` factor applied to the whole viewing frustum
(`updateStem3DFrustum()`, `script.js:2013`) — the stem and every label
sprite scale together, by construction, because they're both just content
inside the same frustum:

```js
// script.js:2481-2489 (onStem3DWheel)
s.zoom = Math.min(8, Math.max(0.4, s.zoom * (1 - e.deltaY * 0.001)));
updateStem3DFrustum();
```

`updateStem3DFrustum()` sizes `camera.left/right/top/bottom` from the
current stem's length and canvas aspect ratio — but sizing purely from
`halfWidth / aspect` turned out to leave too little vertical room on this
app's wide, short canvas (~4:1) for the ruler and its labels below the log
plus the diameter/cut labels above it, clipping them. It now computes the
actual required half-height from content (butt radius — the largest, since
taper only shrinks toward the top — plus the ruler's own offsets) and
expands the frustum to fit that if the aspect-derived height would be
smaller:

```js
// script.js:2013-2030 (updateStem3DFrustum)
const buttR = stem3DRadiusAt(0);
const neededHalfH = buttR + 2.8;   // ruler baseline + labels, see buildStem3DRuler
let halfW = halfWforLength, halfH = halfW / aspect;
if (halfH < neededHalfH) { halfH = neededHalfH; halfW = halfH * aspect; }
```

Label sprites were first bumped from a 160×48 canvas texture at fixed
world-scale ≈(1.15, 0.42) to 320×96 at ≈(1.8, 0.54)/(2.6, 0.78) — still not
enough on a 57 ft stem, because a *fixed world-unit* scale is inherently a
function of the stem's own length once it's sitting inside a frustum sized
to fit that length: a longer stem means a wider frustum, which shrinks
anything with a constant world size, however generous. The actual fix was
to stop sizing labels in world units at all:

```js
// script.js:2101-2131
function stem3DWorldPerPixel() {           // world units per screen pixel, right now
    const visibleWorldWidth = (s.camera.right - s.camera.left) / s.camera.zoom;
    return visibleWorldWidth / stem3dCanvas.width;
}
function applyLabelPixelScale(sprite) {    // re-applied on every zoom step
    const wpp = stem3DWorldPerPixel();
    sprite.scale.set(sprite.userData.pxW * wpp, sprite.userData.pxH * wpp, 1);
}
function makeLabelSprite(text, bg, pxW = 130, pxH = 40) {
    // ...builds the canvas texture as before...
    sprite.userData.pxW = pxW; sprite.userData.pxH = pxH;
    applyLabelPixelScale(sprite);
    stem3d.labelSprites.push(sprite);      // tracked so wheel-zoom can re-apply without a full rebuild
    return sprite;
}
```

Every label now specifies a target size in **screen pixels** (ruler ticks
60×24, diameter callouts 72×26, cut labels 150×46), converted to world units
at render time via the current zoom. This is the same convention real
engineering drawings use for dimension text — a fixed point size regardless
of drawing scale — and it means label legibility no longer depends on how
long the loaded stem happens to be. The trade-off: labels don't visually
grow when the log itself is zoomed in (only the log does) — deliberate,
since the whole point was guaranteed legibility at every zoom level and
stem length, not just proportional scaling. `stem3d.labelSprites` is reset
(`.length = 0`) at the top of every `updateStem3D()` rebuild (its previous
contents are already gone via the group `.clear()` calls) and re-populated
as labels are recreated; `onStem3DWheel` re-applies `applyLabelPixelScale`
to whatever's currently in that array, since zoom alone doesn't trigger a
full scene rebuild.

Ruler tick/label spacing (the gap between a foot tick and its number, and
between the log's surface and the diameter callouts) is computed the same
way — in pixels via `stem3DWorldPerPixel()` at build time — so the layout
looks like a consistent, comfortable gap regardless of zoom or stem length,
rather than a fixed world-unit gap that would look enormous next to a small
label or cramped next to a large one.

### Default camera framing — why azimuth = 0

Requirement: the log should visibly lie down left-to-right, butt on the
left, by default. Rather than eyeballing a camera angle, this was derived
from Three.js's `lookAt` basis construction:

For a camera at `eye = target + dist·(sinθ·sinφ, cosθ, sinθ·cosφ)` (θ =
polar, φ = azimuth) looking at `target`, the camera's local **right** axis
(screen-right) works out to:

```
zaxis = normalize(eye - target)
xaxis = normalize(cross(up, zaxis))
```

At **azimuth = 0**, `eye.x == target.x` exactly (no X offset), so
`zaxis = (0, cosθ, sinθ)` — zero X component — and
`xaxis = cross((0,1,0), (0,cosθ,sinθ)) = (sinθ, 0, 0)`, which normalizes to
exactly `(1, 0, 0)` for any `θ` in `(0, π)`.

In other words: **screen-right is provably world +X whenever azimuth is 0,
regardless of the elevation (polar) angle.** Since `target.x = totalLength/2`
and butt/top sit at world x=0/x=totalLength, azimuth=0 is what actually
guarantees "butt reads on the left" — it isn't a value that was eyeballed
against a screenshot.

```js
// script.js:1927 (stem3d state, initStem3D)
azimuth: 0, polar: 1.2, dist: 40, target: new THREE.Vector3(0, 0, 0),
```

`polar: 1.2` rad (~69°) just picks a pleasant three-quarter-from-above
elevation; orbiting away from azimuth 0 during inspection is fine — it's
only the *default* that needed to be provably correct. (An earlier draft of
this used azimuth ≈ -0.5, which put the camera closer to an end-on view of
the log rather than a broadside one — caught by working through this math
before publishing, not by trial and error in a browser.)

---

## Geometry Construction

### Sampling the taper and sweep

```js
// script.js:2081-2126
function stem3DDiameterAt(h) {
    if (currentTree?.profile?.length > 1) return lerpSeries(currentTree.profile, 'd', h);
    return buttDia - (buttDia - topDia) * (h / totalLength);
}
function stem3DSweepOffsetInAt(h) {
    if (currentTree?.sweepCurve?.length > 1) {
        const curve = currentTree.sweepCurve;
        if (h > curve[curve.length - 1].h) return 0;
        return lerpSeries(curve, 'off', h);
    }
    // Fallback: same sine-bump model the 2D view uses for sweep defects,
    // in inches rather than pixels.
    let off = 0;
    currentDefects.forEach(d => {
        if (d.type !== 'sweep' || h < d.startFt || h > d.endFt) return;
        const span = Math.max(0.01, d.endFt - d.startFt);
        const progress = (h - d.startFt) / span;
        off += (d.widthIn > 0 ? d.widthIn : 1) * Math.sin(progress * Math.PI);
    });
    return off;
}
```

`lerpSeries` (`script.js:2068`) is a small generic piecewise-linear
interpolator shared by both functions.

### Radius exaggeration

A real stem's diameter is small next to its length — a 20"-diameter, 40 ft
log is roughly a 1:24 ratio. Rendered at true relative scale inside a
framed camera view, that reads as a hairline, not a log (this was exactly
the first piece of user feedback after the initial integration: *"very
difficult to see the dimensions of the log and where to cut"*).

The fix is a disclosed, length-preserving radius exaggeration:

```js
// script.js:2109-2113
const RADIUS_SCALE = 4.5;

function stem3DRadiusAt(h) {
    return (stem3DDiameterAt(h) / 2 / FT2IN) * RADIUS_SCALE;
}
```

This is applied **only** inside `stem3DCenterAt` / `buildStem3DCenters` —
the single source every consumer (log tube, end caps, defect patches, cut
rings, the hover-preview ring) reads its radius from — so the exaggeration
is applied exactly once and consistently everywhere. Length is never
touched. A small on-screen badge (`#stem3dBadge` in `index.html`) discloses
the factor:

> "diameter shown ×4.5 for visibility — read true inches from the labels"

— and the ruler (below) always prints the *true*, unexaggerated diameter in
inches, so a player never has to trust the visual proportions for a real
number that matters for grading.

### The tube mesh

Rather than `THREE.LatheGeometry` (which forces circular cross-sections
lathed around a single straight axis with no per-height lateral offset), the
log is a hand-built `BufferGeometry`: a ring of vertices at each sampled
height, stitched into quads between consecutive rings.

```js
// script.js:2114-2126 — sample centers along the stem
function buildStem3DCenters() {
    const nRings = Math.max(2, Math.round(totalLength * RINGS_PER_FT));
    const centers = [];
    for (let i = 0; i <= nRings; i++) {
        const x = totalLength * i / nRings;
        centers.push({ x, r: stem3DRadiusAt(x), y: stem3DSweepOffsetInAt(x) / FT2IN });
    }
    return centers;
}

// script.js:2176 — buildLogTubeGeometry(centers)
centers.forEach((c, ri) => {
    for (let s = 0; s < SEGMENTS; s++) {
        const a = (s / SEGMENTS) * Math.PI * 2;
        const ny = Math.cos(a), nz = Math.sin(a);
        positions.push(c.x, c.y + ny * c.r, nz * c.r);   // ring vertex, offset by sweep in Y
        normals.push(0, ny, nz);
        uvs.push(ri / (centers.length - 1) * (totalLength / 6), s / SEGMENTS);
    }
});
```

`RINGS_PER_FT = 3` and `SEGMENTS = 20` (`script.js:2098`) control mesh
density — chosen for a smooth silhouette at typical 20-50 ft stem lengths
without generating an excessive vertex count.

**Known simplification:** each ring stays in a fixed horizontal (Y-Z) plane
rather than a true tube-normal (Frenet) frame perpendicular to the local
centerline tangent. At the gentle curvatures mill-study sweep actually
produces (a few inches of offset over 10+ ft) this is visually
indistinguishable from a properly-framed tube; it would show visible
seams/pinching on a much sharper bend.

### End caps and bark/end-grain textures

Both end caps are small triangle-fan `BufferGeometry`s (`buildCapGeometry`,
`script.js:2202`) rather than a library primitive, so they can share the
exact same `center.r`/`center.y` the tube uses at that end.

Bark and end-grain aren't image assets — they're generated at runtime onto
an off-screen `<canvas>` and uploaded as a `THREE.CanvasTexture`:

- `makeBarkTexture()` (`script.js:2010`) paints a base brown fill, then
  scatters hundreds of small dark ellipses (streaky vertical bark texture)
  plus faint horizontal noise lines, tiled via `RepeatWrapping` and a UV
  scale tied to stem length so the texture doesn't stretch on longer stems.
- `makeEndGrainTexture()` (`script.js:2030`) draws concentric rings
  (alternating warm tones, darkening toward the center) plus a few radial
  crack lines and a dark heartwood dot — a simple procedural growth-ring
  look.

### Defects

Each non-sweep defect in `currentDefects` becomes a small flat
`CircleGeometry` patch per affected face, positioned on the tube's actual
(exaggerated) surface at that height and angle:

```js
// script.js:2225 (updateStem3D), defect loop
const angle = (face / 4) * Math.PI * 2;              // face 0-3 -> 0/90/180/270°
const ny = Math.cos(angle), nz = Math.sin(angle);
const mesh = new THREE.Mesh(new THREE.CircleGeometry(sizeFt, 14), mat);
mesh.position.set(c.x, c.y + ny * (c.r + 0.01), nz * (c.r + 0.01));
mesh.lookAt(c.x, c.y + ny * (c.r + 2), nz * (c.r + 2));  // orient outward, tangent to the surface
```

`type: 'sweep'` defects are skipped here — sweep is already expressed by
the bent geometry itself, not as a surface patch.

### The ruler

Always-visible (not hover-only) foot ticks and true-diameter labels,
because the exaggerated silhouette is for shape legibility only and
shouldn't be the thing a player reads numbers off of:

```js
// script.js:2135 (buildStem3DRuler)
- A THREE.Line tick + a text-sprite foot label every 1/2/5 ft (density
  scales down for longer stems) along a baseline below the log.
- Text-sprite diameter labels (true inches, not exaggerated) at the butt,
  1/4, 1/2, 3/4, and top points — same quartile convention the 2D view
  already uses for its diameter callouts.
```

Text labels are small canvas-textured `THREE.Sprite`s (`makeLabelSprite`,
`script.js:2052`) so they always billboard toward the camera regardless of
orbit angle.

---

## Roll Up / Roll Down (face rotation)

The 2D view represents "which face is on top" by recoloring shaded bands.
In 3D this is a literal rotation:

```js
// script.js:2225 (updateStem3D)
s.stemGroup.rotation.x = -logRotation * Math.PI / 2;
```

Rotation is around the stem's own long axis (world X). This is also why
cut-placement math stays simple: rotating around the X axis never changes a
point's world-X coordinate, so every place that reads `hit.point.x` as a
cut position (see below) is unaffected by the current roll.

---

## Interaction Model

### Orbit vs. cut placement

A single pointer gesture on the 3D canvas has to serve two purposes: orbit
the camera to inspect the stem, and place/drag/remove cuts. These are
disambiguated at `pointerdown`:

```js
// script.js:2309 (onStem3DPointerDown)
1. Raycast against existing cut rings first.
   - Hit  -> dragMode = 'cut' (camera locked for the gesture).
   - Miss -> dragMode = 'orbit' (drag rotates the camera).
2. Record the pointerdown screen position and a moved=false flag.
```

```js
// script.js:2417 (onStem3DPointerUp)
- dragMode === 'cut'   -> commit the drag (re-sort cuts[]).
- dragMode === 'orbit' AND the pointer barely moved (<4px)
                       -> treat it as a click: raycast the log mesh and
                          add a new cut at the hit position.
- dragMode === 'orbit' AND it moved              -> it was just an orbit,
                          do nothing further.
```

This means: click the log -> new cut; drag an existing cut ring -> moves
it; drag empty space -> orbits the camera. Right-click on a cut ring
removes it (`onStem3DContextMenu`, `script.js:2441`), mirroring the 2D
view's right-click-to-remove.

### Getting from a mouse event to a stem position

`stem3DRaycastX()` (`script.js:2297`) converts a pointer event to a world-X
(feet) position:

```js
function stem3DRaycastX(e, targetsForFallbackPlane) {
    s.raycaster.setFromCamera(stem3DPointerNDC(e), s.camera);
    const hits = s.raycaster.intersectObjects(s.logGroup.children, false);
    if (hits.length) return hits[0].point.x;
    if (targetsForFallbackPlane) {
        // fall back to a plane so a drag doesn't drop out if the pointer
        // strays off the log's silhouette mid-drag
        const hit = new THREE.Vector3();
        if (s.raycaster.ray.intersectPlane(s.dragPlane, hit)) return hit.x;
    }
    return null;
}
```

The fallback plane is anchored at the cut ring's **actual raycast hit
point** at drag-start time, not at `(cutFt, 0, 0)` — sweep offset means a
cut ring's true position isn't necessarily on the nominal centerline, and
rolling the stem rotates that Y-offset into Y/Z, so only the real hit point
is reliably correct as a plane anchor:

```js
// script.js:2309, inside the cut-hit branch
s.dragPlane.setFromNormalAndCoplanarPoint(
    s.camera.getWorldDirection(new THREE.Vector3()).negate(),
    cutHits[0].point   // not (cuts[idx], 0, 0) — see above
);
```

### Live cut-location feedback (the chainsaw-cursor fix)

The first integration used a chainsaw-icon custom cursor as the only
"where will this cut land" signal, and it wasn't precise enough (user
feedback: *"i don't like the chainsaw — too hard to see where the cut will
actually be"*). Root cause turned out to be a CSS bug, not a 3D problem: the
cursor's `transform: translate(...) rotate(...)` used the default center
`transform-origin`, so rotating the icon swung its blade tip away from the
actual cursor coordinate — the one part of the icon meant to mark a point
was the part guaranteed *not* to stay there. Fixed by pinning
`transform-origin` to the blade tip's own position within the icon
(`50% 96%`) so rotation pivots around the tip instead of the icon's center
(`style.css`, `#chainsawCursor`).

But precision now comes from a dedicated indicator, not the icon:

- **2D** (`drawHoverGuide`, `script.js:496`): a dashed vertical guide line
  plus a `"12' 6" | ⌀ 14.2""` label drawn directly on the canvas at the
  exact snapped hover position, suppressed when it would sit on top of an
  existing cut marker.
- **3D** (`updateStem3DHoverPreview`, `script.js:2343`): a bright cyan ring
  — visually distinct from the solid red rings that mark *committed* cuts
  — tracks the raycast hit position live, plus the same DOM tooltip the 2D
  view uses. Hidden during an active drag (the moving cut ring/orbiting
  camera is the feedback in that case) and rebuilt cheaply each
  `pointermove` by disposing and replacing the ring mesh's geometry rather
  than rebuilding the whole scene.

The chainsaw icon itself is now purely decorative flavor riding alongside
that precise indicator, not the thing a player is meant to read a position
from.

---

## Render Loop and Lifecycle

- `initStem3D()` (`script.js:1905`) lazily creates the renderer, scene,
  camera, and all groups exactly once (`if (stem3d) return;` guard), on
  first switch to 3D — a user who never opens the 3D view never pays for
  a `WebGLRenderer`.
- `setStem3DActive(active)` (`script.js:1977`) starts/stops a
  `requestAnimationFrame` loop so the 3D view isn't rendering every frame
  while the user is looking at the 2D canvas.
- `updateStem3D()` (`script.js:2225`) is the equivalent of the 2D view's
  full redraw: it clears and rebuilds the log/defect/cut/ruler groups from
  current state. It's called on stem load, cut add/drag/remove, roll
  up/down, and trim change — the same triggers that call `redrawCanvases()`
  today.
- Camera zoom auto-frames to the stem's length on load, but **only** resets
  when the stem's length actually changes (`s.framedLength !== totalLength`)
  — not on every cut edit, so a user's zoom/orbit isn't fought mid-drag or
  mid-inspection:

```js
// script.js:2225, tail of updateStem3D
s.target.set(totalLength / 2, 0, 0);
if (s.framedLength !== totalLength) { s.dist = Math.max(6, totalLength * 0.9); s.framedLength = totalLength; }
updateStem3DCamera();
```

---

## Known Limitations / Possible Follow-ups

- **Ring frames aren't tube-normal.** Fine at mill-study sweep magnitudes;
  would need a proper Frenet-frame extrusion for sharper bends.
- **No dispose() on group `.clear()`.** `logGroup.clear()` /
  `defectGroup.clear()` / `cutGroup.clear()` / `rulerGroup.clear()` drop
  object references but don't explicitly `.dispose()` geometries/textures
  first, so long sessions with many cut edits accumulate some GPU-side
  garbage before the browser's GC/GPU driver reclaims it. Not yet a
  problem at this app's session lengths, but worth fixing if the 3D view
  becomes the default.
- **Sweep is not exaggerated.** Only radius is. A stem whose sweep is
  genuinely subtle (a few inches over many feet) will still look nearly
  straight in 3D even with radius exaggerated — true to the real geometry,
  but worth a second disclosed exaggeration slider if sweep visibility
  becomes a complaint the way diameter visibility was.
- **No touch support for the 3D view.** The 2D canvas has dedicated
  `touchstart`/`touchmove`/`touchend` handlers; the 3D view currently only
  wires `pointerdown`/`pointermove`/`pointerup`, which covers mouse and
  (partially) pen/touch via the Pointer Events spec, but hasn't been tested
  on a touch device.
- **The optimal-solution comparison view stays 2D always** (`optCanvas`,
  drawn via the existing `drawLogGraphic`/`drawFaceMap`), regardless of
  which mode the main stem view is in — this was a deliberate scope
  decision, not an oversight, since the optimal-plan comparison is a
  secondary reference view where 2D's compactness is arguably better suited
  anyway.
- **Not yet visually verified in a live browser** as part of this session —
  this sandbox had no network access to install a headless Chromium for
  Playwright/`chromium-cli`. Camera orientation, radius exaggeration, and
  the hover-preview ring were reasoned through analytically (see the
  azimuth derivation above) and syntax-checked (`node --check script.js`),
  but should be spot-checked against a real render, especially after any
  future change to the camera or geometry code.
