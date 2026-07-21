export type Node = {
  id: string;
  position: { x: number; z: number };
};

export type Beam = {
  id: string;
  startNodeId: string;
  endNodeId: string;
  crossSectionId: string;
  materialId: string;
  releases?: {
    start?: { phiY?: true };
    end?: { phiY?: true };
  };
};

export type NodeSupport = {
  id: string;
  nodeId: string;
  ux: 'fixed' | 'free';
  uz: 'fixed' | 'free';
  phiY: 'fixed' | 'free';
};
