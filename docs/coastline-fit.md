# Coastline fit

The coastal mesh follows the same outer basin boundary used by bathymetry. Its shoreline band has 256 segments; the source check samples 19 intermediate bearings per segment and measures less than 0.34 m of radial chord error. Compared with the previous 192-segment coast this adds 448 vertices and 768 triangles, with no new per-frame geometry or mountain meshes.

The water shader masks only the permanent outer basin exterior; it preserves existing island handling, wave displacement and tide-dependent water shading. Source checks sample five water levels from -1.5 m to +1.5 m and measure less than 0.75 m of dry terrain overlap with water deeper than 0.9 m. These are sampled numerical checks, not a proof for every point or a visual review.

The existing simulation does not render a bathymetrically matched exposed seabed for all low-tide shoals; this change does not add or claim that feature. Browser rendering, visual quality, shader compilation on target devices and real GPU performance still need verification.
