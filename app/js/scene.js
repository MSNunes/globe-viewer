import * as twgl from 'twgl.js/dist/4.x/twgl-full'
import moment from 'moment'
import _ from 'lodash'

import  { dispatchEvent } from './utils'
import ControlRange from './controlRange'
import octahedronSphere from './octahedronSphere'
import sunCoordinates from './coordinates.js'

const m4 = twgl.m4

export default class Scene {
  constructor(gl, layerCanvas, layers) {
    this.gl = gl
    this.layerCanvas = layerCanvas
    this.layers = layers

    this.hourOfDay = new ControlRange(12, 0.001, 23.999)
    this.dayOfYear = new ControlRange(182, 1, 365)
    this.elevationScale = new ControlRange(10, 1, 30)

    this.sphere = octahedronSphere(6)

    this.sphereBuffer = twgl.createBufferInfoFromArrays(gl, {
      indices: { numComponents: 3, data: this.sphere.indices },
      position: { numComponents: 3, data: this.sphere.position },
      texcoord: { numComponents: 2, data: this.sphere.texcoord },
      elevation: { numComponents: 1, data: this.sphere.elevation }
    })

    this.plane = twgl.primitives.createPlaneVertices(
      2, 1, 255, 127
    )

    this.plane.elevation = new Float32Array(
      this.sphere.position.length
    )

    this.planeBuffer = twgl.createBufferInfoFromArrays(gl, {
      indices: { numComponents: 3, data: this.plane.indices },
      position: { numComponents: 3, data: this.plane.position },
      texcoord: { numComponents: 2, data: this.plane.texcoord },
      elevation: { numComponents: 1, data: this.plane.elevation }
    })

    this.projection = 'sphere'
    this.renderMode = 'dayAndNight'
    this.fillInElevations()
    this.initTextures()

    window.addEventListener('landmask-updated', () => {
      this.updateLayerTexture('landmask')
    })

    window.addEventListener('borders-updated', () => {
      this.updateLayerTexture('borders')
    })
  }

  updateLayerTexture(texture) {
    let canvas = this.layerCanvas.canvas.node()
    twgl.setTextureFromElement(
      this.gl,
      this.textures[texture + 'Map'],
      canvas
    )

    dispatchEvent('texture-loaded', {
      texture: texture + 'Map',
      width: canvas.width,
      height: canvas.height
    })
  }

  initTextures() {
    let textures = {
      diffuseMap: {
        format: this.gl.RGB,
        internalFormat: this.gl.RGB,
        src: 'data/color-4096.jpg',
        color: [0,0,0,1]
      },
      topographyMap: {
        format: this.gl.LUMINANCE,
        internalFormat: this.gl.LUMINANCE,
        src: 'data/topo-bathy-4096.jpg',
        color: [0,0,0,1]
      },
      landmaskMap: {
        format: this.gl.LUMINANCE,
        internalFormat: this.gl.LUMINANCE,
        width: 2,
        height: 2
      },
      bordersMap: {
        format: this.gl.LUMINANCE,
        internalFormat: this.gl.LUMINANCE,
        width: 2,
        height: 2
      },
      lightsMap: {
        src: 'data/lights-4096.png',
        format: this.gl.LUMINANCE,
        internalFormat: this.gl.LUMINANCE,
        color: [0,0,0,1]
      }
    }

    for (let key in textures) {
      dispatchEvent('texture-loaded', {
        texture: key,
        width: 1,
        height: 1
      })
    }

    this.textures = twgl.createTextures(
      this.gl,
      textures,
      (err, textures, sources) => {
        for (let key in sources) {
          dispatchEvent('texture-loaded', {
            texture: key,
            width: sources[key].width,
            height: sources[key].height
          })
        }
      }
    )
  }

  calculatedMoment() {
    return moment('2016-01-01T00:00:00.000Z')
      .utcOffset(0)
      .dayOfYear(this.dayOfYear.value)
      .add(this.hourOfDay.value * 60 * 60, 'seconds')
  }

  getSunVector() {
    let moment = this.calculatedMoment()
    let sun = sunCoordinates(_.toInteger(moment.format('x')))

    let light = m4.identity()
    light = m4.rotateY(light, (Math.PI / 2) - sun.hourAngle)
    light = m4.rotateZ(light, -sun.declination)
    return light
  }

  getElevationScales() {
    let base = (10034 * 2) / 6371000
    let land = base
    let ocean = 0

    if (this.renderMode === 'elevation') {
      land = this.elevationScale.value * base
      ocean = this.elevationScale.value * base
    }

    return {
      oceanElevationScale: ocean,
      landElevationScale: land
    }
  }

  // Sample texture to fill in vertex attribute.
  // This could just be a texture lookup in the vertex
  // shader, but that results in visible gaps between
  // triangles on iphone.
  fillInElevations() {
    let img = new Image()
    img.onload = () => {
      let canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      let ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, img.width, img.height)
      let data = ctx.getImageData(0, 0, img.width, img.height).data

      let w = img.width - 1
      let h = img.height - 1
      for (let i = 0; i < this.sphere.elevation.length; i++) {
        let u = this.sphere.texcoord[i * 2]
        let v = this.sphere.texcoord[i * 2 + 1]
        let x = _.clamp(_.floor((u == 1 ? 0 : u) * w), 0, w)
        let y = _.clamp(_.floor((v == 1 ? 0 : v) * h), 0, h)
        let sample = data[[x + y * img.width] * 4]
        this.sphere.elevation[i] = (sample / 255) - 0.5
      }

      twgl.setAttribInfoBufferFromArray(
        this.gl,
        this.sphereBuffer.attribs.elevation,
        this.sphere.elevation
      )

      twgl.setAttribInfoBufferFromArray(
        this.gl,
        this.planeBuffer.attribs.elevation,
        this.plane.elevation
      )
    }

    img.src = 'data/topo-bathy-128.jpg'
  }
}
