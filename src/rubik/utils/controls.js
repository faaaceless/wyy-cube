import { Raycaster, Vector2, Vector3, Matrix4 } from 'three'
import { closestNormal, closestPosition } from './core'

export class Controls {
  constructor(camera, scene, renderer, cube) {
    this.camera = camera
    this.scene = scene
    this.renderer = renderer
    this.cube = cube
    this.raycaster = new Raycaster()
    this.operating = false
    this.compensation = false
    this.shuffling = false
    this.undoing = false
    this.solving = false
    this.lastTouch = null

    const frames = this.cube.order <= 10 ? 60 : 30
    this.mousedownHandle = this.mousedownHandle.bind(this)
    this.mouseupHandle = this.mouseupHandle.bind(this)
    this.mousemoveHandle = throttle(this.mousemoveHandle.bind(this), 1000 / frames)
    this.touchStartHandle = this.touchStartHandle.bind(this)
    this.touchEndHandle = this.touchEndHandle.bind(this)
    this.touchMoveHandle = throttle(this.touchMoveHandle.bind(this), 1000 / frames)
    this.init()
  }

  get domElement() {
    return this.renderer.domElement
  }

  get faces() {
    return this.cube.faces
  }

  init() {
    this.domElement.addEventListener('mousedown', this.mousedownHandle)
    this.domElement.addEventListener('mousemove', this.mousemoveHandle)
    this.domElement.addEventListener('mouseup', this.mouseupHandle)
    window.addEventListener('mouseout', this.mouseupHandle)
    this.domElement.addEventListener('touchstart', this.touchStartHandle)
    this.domElement.addEventListener('touchend', this.touchEndHandle)
    this.domElement.addEventListener('touchmove', this.touchMoveHandle)
    window.addEventListener('touchcancel', this.touchEndHandle)
  }

  dispose() {
    this.domElement.removeEventListener('mousedown', this.mousedownHandle)
    this.domElement.removeEventListener('mousemove', this.mousemoveHandle)
    this.domElement.removeEventListener('mouseup', this.mouseupHandle)
    window.removeEventListener('mouseout', this.mouseupHandle)
    this.domElement.removeEventListener('touchstart', this.touchStartHandle)
    this.domElement.removeEventListener('touchend', this.touchEndHandle)
    this.domElement.removeEventListener('touchmove', this.touchMoveHandle)
    window.removeEventListener('touchcancel', this.touchEndHandle)
  }

  mousedownHandle(e) {
    e.preventDefault()
    this.operateStart(e.offsetX, e.offsetY)
  }

  touchStartHandle(e) {
    e.preventDefault()
    const x = e.touches[0].clientX
    const y = e.touches[0].clientY
    this.lastTouch = { x, y }
    this.operateStart(x, y)
  }

  mousemoveHandle(e) {
    e.preventDefault()
    this.operateDrag(e.offsetX, e.offsetY, e.movementX, e.movementY)
  }

  touchMoveHandle(e) {
    e.preventDefault()
    if (!this.lastTouch) return
    const x = e.touches[0].clientX
    const y = e.touches[0].clientY
    this.operateDrag(x, y, x - this.lastTouch.x, y - this.lastTouch.y)
    this.lastTouch = { x, y }
  }

  mouseupHandle(e) {
    e.preventDefault()
    this.operateEnd()
  }

  touchEndHandle(e) {
    e.preventDefault()
    this.operateEnd()
  }

  operateStart(offsetX, offsetY) {
    if (this.operating) return
    this.operating = true
    this.startPos = new Vector2()
    const intersect = this.getIntersects(offsetX, offsetY)

    this.face = null
    if (intersect) {
      this.face = intersect.face
      this.startPos = new Vector2(offsetX, offsetY)
    }
  }

  operateDrag(offsetX, offsetY, movementX, movementY) {
    if (!this.operating || this.compensation) return
    const winSize = {
      width: this.domElement.width,
      height: this.domElement.height
    }
    if (this.face) { // rotate one level
      const curPos = new Vector2(offsetX, offsetY)
      this.cube.rotateLevel(this.startPos, curPos, this.face, this.camera, winSize)
    } else { // rotate the whole cube
      const movement = Math.sqrt(movementX * movementX + movementY * movementY)
      const moveForHalfPI = this.cube.dragForHalfPI(this.camera, winSize)
      const rotateAngle = 0.5 * Math.PI * movement / moveForHalfPI
      this.faces.rotateOnWorldAxis(new Vector3(movementY, movementX, 0).normalize(), 4 * rotateAngle)
    }
    this.renderer.render(this.scene, this.camera)
  }

  operateEnd() {
    // this.compensation here is to prevent mouseup after mouseout triggered
    if (!this.operating || this.compensation) return
    if (!this.face) {
      this.operating = false
      return
    }
    this.compensation = true
    const rotateCompensation = this.cube.rotateCompensation()
    const animate = () => {
      const goOn = rotateCompensation()
      this.renderer.render(this.scene, this.camera)
      if (goOn) {
        requestAnimationFrame(animate)
      } else {
        this.operating = false
        this.compensation = false
        this.face = null
        this.lastTouch = null
      }
    }
    animate()
  }

  async doShuffle(steps) {
    if (this.operating || this.compensation) return
    this.dispose()
    this.shuffling = true
    for (let i = 0; i < steps; i++) {
      await this.shuffle()
    }
    this.init()
    this.shuffling = false
  }

  shuffle() {
    this.face = this.faces.children[Math.floor(Math.random() * this.faces.children.length)]
    const winSize = {
      width: this.domElement.width,
      height: this.domElement.height
    }
    const x = Math.floor(Math.random() * winSize.width / 2)
    const y = Math.floor(Math.random() * winSize.height / 2)
    this.cube.rotateLevel(new Vector2(0, 0), new Vector2(x, y), this.face, this.camera, winSize)
    const rotateCompensation = this.cube.rotateCompensation()
    return new Promise((resolve) => {
      const animate = () => {
        const goOn = rotateCompensation()
        if (goOn) {
          requestAnimationFrame(animate)
        } else {
          this.operating = false
          this.compensation = false
          this.face = null
          resolve()
        }
      }
      requestAnimationFrame(animate)
    })
  }

  undo() {
    if (this.operating || this.compensation || this.cube.steps.length === 0) return
    this.dispose()
    this.undoing = true
    const info = this.cube.steps.pop()
    // reverse of infoUpdate in core.js
    const rotateMat = new Matrix4().makeRotationAxis(info.rotateAxis, -info.rotateAngle % (2 * Math.PI))
    info.rotateFaces.forEach((face) => {
      face.applyMatrix4(rotateMat)
      face.updateMatrix()
      const normal = face.info.normal.clone().applyMatrix4(rotateMat)
      const position = face.info.position.clone().applyMatrix4(rotateMat)
      face.info.normal = closestNormal(normal)
      face.info.position = closestPosition(this.cube.order, this.cube.size, position)
      face.position.copy(face.info.position)
    })
    if (!this.solving) this.init()
    this.undoing = false
  }

  solve() {
    let tick = 0
    const speed = Math.ceil(120 / this.cube.steps.length)
    return new Promise((resolve) => {
      const animate = () => {
        if (this.cube.steps.length > 0) {
          if (tick % speed === 0) this.undo()
          tick++
          requestAnimationFrame(animate)
        } else {
          resolve()
        }
      }
      requestAnimationFrame(animate)
    })
  }

  async doSolve() {
    if (this.operating || this.compensation) return
    this.dispose()
    this.solving = true
    this.solve().then(() => {
      this.init()
      this.solving = false
    })
  }

  getIntersects(offsetX, offsetY) {
    // clip coords are in range [-1, 1]
    const x = (offsetX / this.domElement.clientWidth) * 2 - 1
    const y = -(offsetY / this.domElement.clientHeight) * 2 + 1

    this.raycaster.setFromCamera({ x, y }, this.camera)

    const intersectFaces = []
    for (let i = 0; i < this.faces.children.length; i++) {
      const intersects = this.raycaster.intersectObjects([this.faces.children[i]])
      if (intersects.length > 0) {
        intersectFaces.push({
          distance: intersects[0].distance,
          face: this.faces.children[i]
        })
      }
    }
    intersectFaces.sort((item1, item2) => item1.distance - item2.distance)
    if (intersectFaces.length > 0) return intersectFaces[0]

    return null
  }
}

function throttle(callback, interval, heading = true, trailing = false) {
  let last = 0
  let timer = null
  const _throttle = function (...args) {
    const now = Date.now()
    if (!heading && last === 0) {
      last = now
    }
    const remain = interval - (now - last)
    if (remain <= 0) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      callback.apply(this, args)
      last = now
    } else {
      if (trailing && !timer) {
        timer = setTimeout(() => {
          timer = null
          last = Date.now()
          callback.apply(this, args)
        }, remain)
      }
    }
  }
  return _throttle
}
