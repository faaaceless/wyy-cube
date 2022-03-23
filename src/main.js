import { Rubik } from './rubik/rubik.js'
import './assets/style.css'

const Ele = document.querySelector('#rubik')
const rubik = new Rubik(Ele)

const orderSelector = document.querySelector('#order')
orderSelector.addEventListener('change', (e) => {
  e.stopPropagation()
  rubik.setOrder(e.target.value)
})

const restoreBtn = document.querySelector('#restore')
restoreBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  rubik.setOrder(orderSelector.value)
})

const shuffleBtn = document.querySelector('#shuffle')
shuffleBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  rubik.shuffle()
})

const undoBtn = document.querySelector('#undo')
undoBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  rubik.undo()
})

const solveBtn = document.querySelector('#solve')
solveBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  rubik.solve()
})
