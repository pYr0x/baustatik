#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "mesh-2d.h"

// `triangle.h` erwartet diese beiden Typen vom einbindenden Programm. In
// `triangle.c` stehen dieselben Definitionen in einer eigenen Translation Unit.
typedef double REAL;
typedef void VOID;
#include "triangle.h"

struct Mesh2DResult {
  /* Die opake Hülle trennt Triangle-Details von der JS-ABI. */
  struct triangulateio output;
};

static void free_triangle_output(struct triangulateio *output) {
  // `triangulate()` allokiert jedes Ausgabefeld einzeln. `holelist` und
  // `regionlist` sind hiervon ausgenommen: sie zeigen auf die Eingabe.
  trifree(output->pointlist);
  trifree(output->pointattributelist);
  trifree(output->pointmarkerlist);
  trifree(output->trianglelist);
  trifree(output->triangleattributelist);
  trifree(output->neighborlist);
  trifree(output->segmentlist);
  trifree(output->segmentmarkerlist);
  trifree(output->edgelist);
  trifree(output->edgemarkerlist);
  trifree(output->normlist);
}

Mesh2DResult *mesh_2d_generate(const double *points, int point_count,
                                const int *segments,
                                const int *segment_markers, int segment_count,
                                const double *hole_points, int hole_count,
                                const char *switches) {
  struct triangulateio input;
  Mesh2DResult *result;

  // Triangle liest auch unbenutzte Felder der Struct in einzelnen Pfaden. Die
  // vollständige Nullinitialisierung hält die C-Grenze unabhängig von Switches.
  memset(&input, 0, sizeof(input));
  result = malloc(sizeof(*result));
  if (result == NULL) {
    return NULL;
  }
  memset(result, 0, sizeof(*result));

  input.pointlist = (REAL *)points;
  input.numberofpoints = point_count;
  input.segmentlist = (int *)segments;
  input.segmentmarkerlist = (int *)segment_markers;
  input.numberofsegments = segment_count;
  input.holelist = (REAL *)hole_points;
  input.numberofholes = hole_count;

  triangulate((char *)switches, &input, &result->output, NULL);
  return result;
}

void mesh_2d_result_free(Mesh2DResult *result) {
  if (result == NULL) {
    return;
  }
  free_triangle_output(&result->output);
  // Dieser Wrapper selbst stammt nicht von Triangle und deshalb von `malloc`.
  free(result);
}

const double *mesh_2d_result_points(const Mesh2DResult *result) {
  return result->output.pointlist;
}

const int *mesh_2d_result_elements(const Mesh2DResult *result) {
  return result->output.trianglelist;
}

const int *mesh_2d_result_point_markers(const Mesh2DResult *result) {
  return result->output.pointmarkerlist;
}

const int *mesh_2d_result_boundary_segments(const Mesh2DResult *result) {
  return result->output.segmentlist;
}

const int *mesh_2d_result_boundary_markers(const Mesh2DResult *result) {
  return result->output.segmentmarkerlist;
}

int mesh_2d_result_point_count(const Mesh2DResult *result) {
  return result->output.numberofpoints;
}

int mesh_2d_result_element_count(const Mesh2DResult *result) {
  return result->output.numberoftriangles;
}

int mesh_2d_result_element_width(const Mesh2DResult *result) {
  return result->output.numberofcorners;
}

int mesh_2d_result_boundary_segment_count(const Mesh2DResult *result) {
  return result->output.numberofsegments;
}
