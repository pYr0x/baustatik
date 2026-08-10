export interface TriangleModule {
  readonly HEAPF64: Float64Array;
  readonly HEAP32: Int32Array;
  _malloc(byteCount: number): number;
  _free(pointer: number): void;
  stringToNewUTF8(value: string): number;
  _mesh_2d_generate(
    points: number,
    pointCount: number,
    segments: number,
    segmentMarkers: number,
    segmentCount: number,
    holePoints: number,
    holeCount: number,
    switches: number,
  ): number;
  _mesh_2d_result_free(result: number): void;
  _mesh_2d_result_points(result: number): number;
  _mesh_2d_result_elements(result: number): number;
  _mesh_2d_result_point_markers(result: number): number;
  _mesh_2d_result_boundary_segments(result: number): number;
  _mesh_2d_result_boundary_markers(result: number): number;
  _mesh_2d_result_point_count(result: number): number;
  _mesh_2d_result_element_count(result: number): number;
  _mesh_2d_result_element_width(result: number): number;
  _mesh_2d_result_boundary_segment_count(result: number): number;
}

declare function createTriangleModule(): Promise<TriangleModule>;

export default createTriangleModule;
