#ifndef BAUSTATIK_MESH_2D_H
#define BAUSTATIK_MESH_2D_H

typedef struct Mesh2DResult Mesh2DResult;

Mesh2DResult *mesh_2d_generate(const double *points, int point_count,
                                const int *segments,
                                const int *segment_markers, int segment_count,
                                const double *hole_points, int hole_count,
                                const char *switches);
void mesh_2d_result_free(Mesh2DResult *result);
const double *mesh_2d_result_points(const Mesh2DResult *result);
const int *mesh_2d_result_elements(const Mesh2DResult *result);
const int *mesh_2d_result_point_markers(const Mesh2DResult *result);
const int *mesh_2d_result_boundary_segments(const Mesh2DResult *result);
const int *mesh_2d_result_boundary_markers(const Mesh2DResult *result);
int mesh_2d_result_point_count(const Mesh2DResult *result);
int mesh_2d_result_element_count(const Mesh2DResult *result);
int mesh_2d_result_element_width(const Mesh2DResult *result);
int mesh_2d_result_boundary_segment_count(const Mesh2DResult *result);

#endif
