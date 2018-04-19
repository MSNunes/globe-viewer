import { v3 } from 'twgl.js/dist/4.x/twgl-full'
import _ from 'lodash'

import {
  Vec2Array,
  Vec3Array
} from './vectorArray'

// icosphere-like sphere, except based on octahedron
// which gives a clean vertical seam for texturing
// based on:
// https://github.com/hughsk/icosphere/blob/master/index.js

export default function octahedronSphere(divisions) {
  let initialPoints = new Float32Array(_.flatten([
    [0,1,0], [0,0,-1], [-1,0,0],
    [0,1,0], [-1,0,0], [0,0,1],
    [0,1,0], [0,0,1], [1,0,0],
    [0,1,0], [1,0,0], [0,0,-1],
    [0,-1,0], [-1,0,0], [0,0,-1],
    [0,-1,0], [0,0,1], [-1,0,0],
    [0,-1,0], [1,0,0], [0,0,1],
    [0,-1,0], [0,0,-1], [1,0,0]
  ]))

  let pointLODs = [new Vec3Array(initialPoints)]
  for (let i = 0; i < divisions; i++) {
    let current = pointLODs[i]
    let split = new Vec3Array(
      new Float32Array(current.data.length * 4)
    )

    for (let j = 0; j < current.length; j+=3) {
      splitTriangle(current, split, j)
    }

    pointLODs.push(split)
  }

  let points = pointLODs[pointLODs.length - 1]
  let pointUvs = new Vec2Array(new Float32Array(points.length * 2))

  for (let i = 0; i < points.length; i+=3) {
    calculateUvs(pointUvs, points, i)
  }

  let index = 0
  let indices = new Int16Array(points.length)
  let indexedPoints = new Vec3Array(new Float32Array(points.data.length))
  let indexedUvs = new Vec2Array(new Float32Array(pointUvs.data.length))
  let pointMap = {}

  let i = 0
  for (i; i < points.length; i++) {
    let point = points.get(i)
    let uv = pointUvs.get(i)
    let key = [point[0], point[1], point[2], uv[0], uv[1]].join(',')
    let existingIndex = pointMap[key]
    if (existingIndex === undefined) {
      pointMap[key] = index
      indexedPoints.set(index, point)
      indexedUvs.set(index, uv)
      indices[i] = index
      index += 1
    }
    else {
      indices[i] = existingIndex
    }
  }

  return {
    indices: indices.subarray(0, i),
    position: indexedPoints.data.subarray(0, index * 3),
    texcoord: indexedUvs.data.subarray(0, index * 2),
    elevation: new Float32Array(index)
  }
}

function splitTriangle(points, target, offset) {
  let a = points.get(offset)
  let b = points.get(offset + 1)
  let c = points.get(offset + 2)
  let ab = Array.prototype.slice.call(v3.normalize(v3.add(a, b)))
  let bc = Array.prototype.slice.call(v3.normalize(v3.add(b, c)))
  let ca = Array.prototype.slice.call(v3.normalize(v3.add(c, a)))

  target.setRange(offset * 4, [
    a, ab, ca,
    ab, bc, ca,
    ab, b, bc,
    ca, bc, c
  ])
}

function calculateUvs(pointUvs, points, offset) {
  let a = uvPoint(points.get(offset))
  let b = uvPoint(points.get(offset + 1))
  let c = uvPoint(points.get(offset + 2))

  let min = Math.min(a[0], b[0], c[0])
  let max = Math.max(a[0], b[0], c[0])

  // Seam triangle will span almost the whole range from 0 to 1.
  // Fix seam by clamping the high values to 0.
  if (max - min > 0.5) {
    a[0] = a[0] == 1 ? 0 : a[0]
    b[0] = b[0] == 1 ? 0 : b[0]
    c[0] = c[0] == 1 ? 0 : c[0]
  }

  pointUvs.setRange(offset, [a, b, c])
}

function uvPoint(p) {
  return [
    (Math.atan2(p[0], p[2]) / (2 * Math.PI)) + 0.5,
    1.0 - ((Math.asin(p[1]) / Math.PI) + 0.5)
  ]
}
