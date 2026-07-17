# Art direction: cinematic quiet geometric modernism

## Intent

The game should look designed, not merely simplified. The July 17 Fair Winds
mockups are the visual north star: a cinematic modern maritime illustration
translated into 3D through calm geometry, strong composition, restrained
color, premium atmosphere, and movement that carries meaning.

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
- Water uses the standard low-poly construction: one continuous, generously
  tessellated triangular surface; slow vertex displacement; controlled normals;
  subtle neighboring tonal variation; depth color; restrained Fresnel and
  sun/moon highlights; shoreline response; and localized wake/foam. It should
  read smooth and reflective at composition distance with only subtle faceting,
  never as a tiled mosaic, paper ribbons, or unrelated polygon patches.
- Terrain uses layered silhouettes and atmospheric color steps. Distant shores
  dissolve into haze instead of relying on dense assets.
- The boat is simplified but nautically correct. Mast, boom, sail, sheet,
  rudder, keel behavior, telltales, and heel must remain legible.
- Human figures, if present, use simple faceted bodies and restrained motion;
  no detailed faces are necessary.
- UI uses clean modern typography, thin white rules and instruments, geometric
  sail/diamond motifs, generous space, and translucent panels only when text
  needs separation. One primary teaching message at a time.

See [the visual and world redesign plan](VISUAL_REDESIGN_PLAN.md) for the
reference audit, environment construction, brand system, camera, HUD, boats,
hazards, and acceptance criteria.

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
- Use one resolution-capped planar reflection for the scenery and boat, blurred
  and distorted by the shared analytic wave normal. Keep the underlying water
  low-poly through adaptive triangular displacement, controlled colour
  faceting, restrained Fresnel, and one broad sun path; avoid hard per-triangle
  normals that turn ordinary water into a tiled crystalline sheet.
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
