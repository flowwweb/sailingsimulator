# Art direction: quiet geometric modernism

## Intent

The game should look designed, not merely simplified. The target is a modern
maritime illustration translated into 3D: calm geometry, strong composition,
restrained color, and movement that carries meaning.

It is explicitly **not** photorealistic, childish, retro low-poly, cel-shaded
anime, or glossy generic mobile-game art.

## Visual rules

- Use simplified, correctly proportioned forms with crisp silhouettes.
- Use medium-size facets and soft ambient shading; do not expose coarse triangles
  merely to advertise “low poly.”
- Prefer vertex colors, two-tone materials, gentle gradients, and sparse
  procedural detail over photo textures.
- Keep a limited lake palette: deep blue-teal water, mist blue-gray distance,
  warm cream sails, charcoal hardware, and one burnt-orange interaction accent.
- Water uses the standard low-poly construction: one continuous, moderately
  tessellated triangular surface; slow vertex displacement; flat face normals;
  subtle blue variation per face; restrained Fresnel/specular highlights; and
  localized wake/foam. It must read as a coherent water surface, never a tiled
  mosaic, paper ribbons, or a field of unrelated polygon patches.
- Terrain uses layered silhouettes and atmospheric color steps. Distant shores
  dissolve into haze instead of relying on dense assets.
- The boat is simplified but nautically correct. Mast, boom, sail, sheet,
  rudder, keel behavior, telltales, and heel must remain legible.
- Human figures, if present, use simple faceted bodies and restrained motion;
  no detailed faces are necessary.
- UI uses clean modern typography, thin rules, soft translucent panels, and
  generous space. One primary teaching message at a time.

## Why this is easy to produce well

- Most assets can be generated from primitives or small procedural meshes.
- Vertex colors and shared materials remove UV and texture-production burden.
- AI can generate consistent concept targets because the palette, geometry,
  lighting, and avoid-list are explicit.
- The style tolerates modest geometry while camera, atmosphere, sail motion,
  wake, and composition provide polish.
- A small set of authored invariants prevents the “random low-poly asset pack”
  look: consistent facet size, palette, roughness, edge softness, and scale.

## Production constraints

- Target 60 fps on a mid-range laptop at 1080p and 30 fps on supported phones.
- Use one directional light, hemisphere/ambient light, baked or blob contact
  shadows, distance fog, and restrained post-processing.
- Avoid expensive real-time planar reflections. Let displaced triangular
  geometry and flat face normals produce the low-poly highlight pattern, then
  add restrained Fresnel color and one sun-glint term.
- Avoid unique 4K textures. A tiny noise/foam atlas is acceptable only when
  geometry and color cannot carry the effect.
- Every mockup and asset prompt must include the style paragraph below.

## Reusable style prompt

> Quiet geometric modernism; simplified low-poly forms with carefully controlled
> facet size; clean faceted shading plus soft ambient light; sparse premium
> materials; slightly posterized atmospheric gradients; crisp silhouettes;
> restrained maritime editorial palette; intentional contemporary game art;
> not photorealistic, not childish, not toy-like, no outlines, no generic
> mobile-game gloss.
