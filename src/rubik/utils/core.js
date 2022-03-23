import { initCube } from './init'
import { Matrix4, Vector3, Vector2 } from 'three'

export class Cube {
  constructor(order = 3, size = 1) {
    this.order = order
    this.size = size
    this.faces = initCube(order, size)
    this.rotating = false
    this.rotateInfo = null
    this.steps = []
  }

  rotateLevel(prePos, curPos, curFace, camera, winSize) {
    const dragVec = curPos.clone().sub(prePos)

    if (!this.rotating) {
      // get information about the rotate for this round
      this.judgeRotate(dragVec, curFace, camera, winSize)
      this.rotating = true
    }

    // rotate
    // projection of dragVec to rotation Vec
    const dragVecProjection = dragVec.dot(this.rotateInfo.rotateVec.winVec) / this.rotateInfo.rotateVec.winVec.length()
    const moveForHalfPI = this.dragForHalfPI(camera, winSize)
    const rotateAngle = 1.5 * Math.PI * dragVecProjection / moveForHalfPI
    // the diff is the real angle to rotate
    const rotateAngleDiff = rotateAngle - this.rotateInfo.rotateAngle
    this.rotateInfo.rotateAngle = rotateAngle

    const rotateMat = new Matrix4().makeRotationAxis(this.rotateInfo.rotateAxis, rotateAngleDiff)
    this.rotateInfo.rotateFaces.forEach((face) => {
      face.applyMatrix4(rotateMat)
      face.updateMatrix()
    })
  }

  rotateCompensation() {
    // compensate to times of PI/2
    const angleToFix = fixToHalfPI(this.rotateInfo.rotateAngle)
    const frames = 20
    const speed = 0.5 * Math.PI / frames
    let rotatedAngle = 0

    const rotate = () => {
      if (rotatedAngle < Math.abs(angleToFix)) {
        let curAngle = speed
        if (rotatedAngle + curAngle > Math.abs(angleToFix)) {
          curAngle = Math.abs(angleToFix) - rotatedAngle
        }
        rotatedAngle += curAngle
        curAngle = angleToFix > 0 ? curAngle : -curAngle
        const rotateMat = new Matrix4().makeRotationAxis(this.rotateInfo.rotateAxis, curAngle)
        this.rotateInfo.rotateFaces.forEach((face) => {
          face.applyMatrix4(rotateMat)
          face.updateMatrix()
        })
        return true
      } else {
        this.rotating = false
        this.infoUpdate()
        return false
      }
    }
    return rotate
  }

  infoUpdate() {
    const angleToFix = fixToHalfPI(this.rotateInfo.rotateAngle)
    this.rotateInfo.rotateAngle += angleToFix

    // update info of rotateFaces
    const angle = this.rotateInfo.rotateAngle % (2 * Math.PI)
    if (Math.abs(angle) > 0.25 * Math.PI) {
      const rotateMat = new Matrix4().makeRotationAxis(this.rotateInfo.rotateAxis, angle)
      this.rotateInfo.rotateFaces.forEach((face) => {
        const normal = face.info.normal.clone().applyMatrix4(rotateMat)
        const position = face.info.position.clone().applyMatrix4(rotateMat)
        face.info.normal = closestNormal(normal)
        face.info.position = closestPosition(this.order, this.size, position)
        face.position.copy(face.info.position)
      })
    }
    this.steps.push(this.rotateInfo)
    this.rotateInfo = null
  }

  judgeRotate(dragVec, curFace, camera, winSize) {
    // the 4 possible vectors to rotate
    const rotateVecs = this.getRotateVecs(curFace, camera, winSize)
    // compare the drag vector with the 4 possible vectors
    let angle
    let minAngle
    let rotateVec
    rotateVecs.forEach((vec) => {
      angle = Math.abs(angleBetweenVecs(vec.winVec, dragVec))
      if (!minAngle || angle < minAngle) {
        minAngle = angle
        rotateVec = vec
      }
    })
    // rotateVec in 3d space
    const rotateVec3 = rotateVec.end.info.position.clone().sub(rotateVec.start.info.position).normalize()
    // the Axis around witch to rotate is the cross product of the normal and the rotateVec3
    const rotateAxis = curFace.info.normal.clone().cross(rotateVec3).normalize()

    // the faces to rotate
    const rotateFaces = []
    // when judging which faces to rotate, we better think about which cubes to rotate
    // since all the positions we use before are in the plane of the face, transfer them to the center of cubes first
    const curCube = moveToCenter(curFace, this.size)
    this.faces.children.forEach((face) => {
      const cube = moveToCenter(face, this.size)
      const vec = cube.clone().sub(curCube).normalize()
      // if the vec from curCube to a cube is perpendicular to the rotation axis, the cube needs to be rotated
      if (vec.dot(rotateAxis) === 0) {
        rotateFaces.push(face)
      }
    })
    this.rotateInfo = {
      rotateFaces,
      rotateAxis,
      rotateVec,
      rotateAngle: 0
    }
  }

  getRotateVecs(curFace, camera, winSize) {
    const normal = curFace.info.normal
    const position = curFace.info.position
    // all other faces in the same plane
    const facesInSamePlane = this.faces.children.filter((face) => {
      return face.info.normal.equals(normal) && !face.info.position.equals(position)
    })
    // then we want 1 face in the same row and 1 face in the same column
    let siblings
    if (normal.x !== 0) {
      siblings = getSibling(['y', 'z'], position, facesInSamePlane)
    } else if (normal.y !== 0) {
      siblings = getSibling(['x', 'z'], position, facesInSamePlane)
    } else {
      siblings = getSibling(['x', 'y'], position, facesInSamePlane)
    }
    // so that we can derivate the 4 possible vectors to rotate
    const vectors = []
    const winPos = this.getWinPos(curFace, camera, winSize)
    const winPos0 = this.getWinPos(siblings[0], camera, winSize)
    const winPos1 = this.getWinPos(siblings[1], camera, winSize)
    vectors.push({
      winVec: new Vector2(winPos0.x - winPos.x, winPos0.y - winPos.y).normalize(),
      start: curFace,
      end: siblings[0]
    })
    vectors.push({
      winVec: new Vector2(winPos.x - winPos0.x, winPos.y - winPos0.y).normalize(),
      start: siblings[0],
      end: curFace
    })
    vectors.push({
      winVec: new Vector2(winPos1.x - winPos.x, winPos1.y - winPos.y).normalize(),
      start: curFace,
      end: siblings[1]
    })
    vectors.push({
      winVec: new Vector2(winPos.x - winPos1.x, winPos.y - winPos1.y).normalize(),
      start: siblings[1],
      end: curFace
    })
    return vectors
  }

  getWinPos(face, camera, winSize) {
    const modelMat = new Matrix4()
      .multiply(face.matrixWorld)
    // MVP projection
    const pos = new Vector3().applyMatrix4(modelMat)
      .applyMatrix4(camera.matrixWorldInverse)
      .applyMatrix4(camera.projectionMatrix)
    return clipToWin(pos, winSize)
  }

  dragForHalfPI(camera, winSize) {
    const vec = new Vector3(this.order * this.size, 0, 0)
    // vec.project(camera)
    vec.applyMatrix4(camera.matrixWorldInverse)
      .applyMatrix4(camera.projectionMatrix)
    return clipToWin(vec, winSize).x
  }
}

function clipToWin(pos, { width, height }) {
  const x = width * (0.5 + pos.x)
  // y is reversed in 2d
  const y = height * (0.5 - pos.y)
  return { x, y }
}

function getSibling(search, position, faces) {
  let sibling0
  let sibling1
  for (let i = 0; i < faces.length; i++) {
    if (!sibling0 && faces[i].info.position[search[0]] === position[search[0]]) {
      sibling0 = faces[i]
    }
    if (!sibling1 && faces[i].info.position[search[1]] === position[search[1]]) {
      sibling1 = faces[i]
    }
    if (sibling0 && sibling1) return [sibling0, sibling1]
  }
  return false
}

function angleBetweenVecs(vec1, vec2) {
  return Math.acos(vec1.clone().dot(vec2) / (vec1.length() * vec2.length()))
}

function moveToCenter(face, size) {
  const pos = face.info.position.clone()
  pos.sub(face.info.normal.clone().multiplyScalar(size / 2))
  return pos
}

function fixToHalfPI(angle) {
  const sign = angle < 0 ? -1 : 1
  let angleToFix = Math.abs(angle) % (Math.PI * 0.5)
  angleToFix = angleToFix > 0.25 * Math.PI ? Math.PI * 0.5 - angleToFix : -angleToFix
  return angleToFix * sign
}

export function closestNormal(norm) {
  if (Math.round(Math.abs(norm.x) - 1) === 0) return norm.x > 0 ? new Vector3(1, 0, 0) : new Vector3(-1, 0, 0)
  if (Math.round(Math.abs(norm.y) - 1) === 0) return norm.y > 0 ? new Vector3(0, 1, 0) : new Vector3(0, -1, 0)
  if (Math.round(Math.abs(norm.z) - 1) === 0) return norm.z > 0 ? new Vector3(0, 0, 1) : new Vector3(0, 0, -1)
}

export function closestPosition(order, size, position) {
  const offset = (order - 1) / 2
  const isOdd = order % 2 === 1
  const x = closest(offset, isOdd, position.x / size)
  const y = closest(offset, isOdd, position.y / size)
  const z = closest(offset, isOdd, position.z / size)
  return new Vector3(x, y, z)
}

function closest(offset, isOdd, pos) {
  const sign = pos < 0 ? -1 : 1
  // if it's the border
  if (Math.abs(Math.abs(pos) - offset - 0.5) < 0.1) return sign * (offset + 0.5)
  // if odd: possible values: 0, 1 ... offset
  // if even: possible values: 0.5, 1.5 ... offset
  let start = 0
  let end = isOdd ? offset : offset - 0.5
  const absPos = isOdd ? Math.abs(pos) : Math.abs(pos) - 0.5
  while (start <= end) {
    const mid = Math.floor((start + end) / 2)
    const res = Math.round(absPos - mid)
    if (res === 0) return isOdd ? sign * mid : sign * (mid + 0.5)
    if (res > 0) {
      start = mid + 1
    } else {
      end = mid - 1
    }
  }
}
