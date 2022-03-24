import { init } from './utils/init'
import { Cube } from './utils/core'
import { Controls } from './utils/controls'

export class Rubik {
  constructor(domEle) {
    const { camera, scene, renderer } = init()
    this.domEle = domEle
    this.camera = camera
    this.scene = scene
    this.camera.lookAt(this.scene.position)
    this.renderer = renderer
    this.domEle.appendChild(this.renderer.domElement)
    this.reSize()
    this.animate()
    this.setOrder()
    window.addEventListener('resize', () => {
      this.reSize()
    })
  }

  setOrder(order = 3) {
    const lastOrder = this.cube?.order || 3
    this.scene.remove(...this.scene.children)
    if (this.controls) this.controls.dispose()
    this.cube = new Cube(order)
    this.scene.add(this.cube.faces)
    this.camera.position.multiplyScalar(order / lastOrder)
    this.controls = new Controls(this.camera, this.scene, this.renderer, this.cube)
  }

  shuffle(steps = 10) {
    if (this.controls.shuffling || this.controls.undoing || this.controls.solving) return
    this.controls.doShuffle(steps)
  }

  undo() {
    if (this.controls.undoing || this.controls.shuffling || this.controls.solving) return
    this.controls.doUndo()
  }

  solve() {
    if (this.controls.undoing || this.controls.shuffling || this.controls.solving) return
    this.controls.doSolve()
  }

  reSize() {
    this.camera.aspect = this.domEle.clientWidth / this.domEle.clientHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(this.domEle.clientWidth, this.domEle.clientHeight)
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  animate() {
    this.render()
    requestAnimationFrame(() => this.animate())
  }
}
