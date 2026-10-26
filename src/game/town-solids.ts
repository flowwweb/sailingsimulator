export interface TownSolid {
  x: number;
  z: number;
  footprint: readonly { x: number; z: number }[];
  minY: number;
  maxY: number;
}

export const LIGHTHOUSE_BASE = { x: 4, y: 2.1, z: 56, width: 9, height: 5, depth: 9 } as const;

export const BASTION_ROCK = {
  radius: 1, detail: 1, minY: -1, maxY: 1,
  // Exact projected silhouette of the authored DodecahedronGeometry(1, 1).
  footprint: [
    [-1, 0], [-0.9341723322868347, -0.35682210326194763],
    [-0.5720614194869995, -0.7905694246292114], [-0.3535533845424652, -0.9256147742271423],
    [0, -1], [0.5720614194869995, -0.7905694246292114],
    [0.9341723322868347, -0.35682210326194763], [1, 0],
    [0.9341723322868347, 0.35682210326194763], [0.5720614194869995, 0.7905694246292114],
    [0.3535533845424652, 0.9256147742271423], [0, 1],
    [-0.5720614194869995, 0.7905694246292114], [-0.9341723322868347, 0.35682210326194763],
  ],
} as const;

export const BASTION_FOOT_ROCKS = Array.from({ length: 12 }, (_, i) => {
  const angle = i / 12 * Math.PI * 2;
  return {
    position: [LIGHTHOUSE_BASE.x + Math.cos(angle) * 6.2, 0.7, LIGHTHOUSE_BASE.z + Math.sin(angle) * 6.2] as const,
    scale: [2.5, 1.6, 2] as const,
    rotation: i,
  };
});

export const LIGHTHOUSE_SOLIDS: readonly TownSolid[] = [
  {
    x: LIGHTHOUSE_BASE.x, z: LIGHTHOUSE_BASE.z,
    footprint: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => ({
      x: LIGHTHOUSE_BASE.x + x! * LIGHTHOUSE_BASE.width / 2,
      z: LIGHTHOUSE_BASE.z + z! * LIGHTHOUSE_BASE.depth / 2,
    })),
    minY: LIGHTHOUSE_BASE.y - LIGHTHOUSE_BASE.height / 2,
    maxY: LIGHTHOUSE_BASE.y + LIGHTHOUSE_BASE.height / 2,
  },
  ...BASTION_FOOT_ROCKS.map(rock => {
    const [x, y, z] = rock.position, [sx, sy, sz] = rock.scale;
    const cos = Math.cos(rock.rotation), sin = Math.sin(rock.rotation);
    return {
      x, z,
      footprint: BASTION_ROCK.footprint.map(([px, pz]) => ({
        x: x + px * sx * cos + pz * sz * sin,
        z: z - px * sx * sin + pz * sz * cos,
      })),
      minY: y + BASTION_ROCK.minY * sy,
      maxY: y + BASTION_ROCK.maxY * sy,
    };
  }),
];
