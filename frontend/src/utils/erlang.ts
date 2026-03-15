/**
 * Erlang-C and Erlang-A (with abandonment) calculations
 * Ported from the Python implementation.
 */

function lgamma(x: number): number {
  // Lanczos approximation for ln(Gamma(x))
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -5.395239384953e-6,
  ]
  let y = x
  let tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (let j = 0; j < 6; j++) {
    y += 1
    ser += c[j] / y
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x)
}

/** Erlang-C waiting probability P(wait > 0) */
export function erlangCPw(a: number, c: number): number {
  if (c <= a) return 1.0

  let logSum = -Infinity
  for (let k = 0; k < c; k++) {
    const logTerm = k * Math.log(a) - lgamma(k + 1)
    // log-sum-exp
    if (logSum === -Infinity) {
      logSum = logTerm
    } else {
      const maxVal = Math.max(logSum, logTerm)
      logSum = maxVal + Math.log(Math.exp(logSum - maxVal) + Math.exp(logTerm - maxVal))
    }
  }

  const logAc = c * Math.log(a) - lgamma(c + 1)
  const acFactor = Math.exp(logAc) * (c / (c - a))
  const sumLinear = Math.exp(logSum)

  return acFactor / (sumLinear + acFactor)
}

export interface ErlangAResult {
  pw: number
  pWaitGtT: number
  pAbandon: number
  slaEst: number
}

/**
 * Engineering approximation for Erlang-A (with abandonment):
 * @param a   traffic intensity (erlangs) = lambda / mu
 * @param c   number of agents
 * @param mu  service rate (calls/minute)
 * @param theta  patience rate (1/patience_minutes)
 * @param tSlaMin  SLA threshold in minutes
 */
export function erlangAEstimates(
  a: number,
  c: number,
  mu: number,
  theta: number,
  tSlaMin: number,
): ErlangAResult {
  if (c <= a) return { pw: 1, pWaitGtT: 1, pAbandon: 1, slaEst: 0 }

  const pw = erlangCPw(a, c)
  const expectedWait =
    (c - a) * mu > 0 ? 1.0 / ((c - a) * mu) : 1e6

  const pAbandon = pw * (1 - Math.exp(-theta * expectedWait))

  const exp1 = -(c - a) * mu * tSlaMin
  const pWaitGtT = pw * (exp1 < -700 ? 0 : Math.exp(exp1))

  const pAbandonBeforeT =
    pw * (1 - Math.exp(-theta * Math.min(expectedWait, tSlaMin)))

  const slaEst = Math.max(0, 1 - pWaitGtT - pAbandonBeforeT)

  return { pw, pWaitGtT, pAbandon, slaEst }
}

/**
 * Find minimum agents to meet SLA + abandon constraints.
 */
export function requiredServers(params: {
  arrivalsPerInterval: number
  ahtMinutes: number
  slaFraction: number
  slaSeconds: number
  abandonFraction: number
  patienceSeconds: number
  intervalLengthMin: number
}): number {
  const {
    arrivalsPerInterval,
    ahtMinutes,
    slaFraction,
    slaSeconds,
    abandonFraction,
    patienceSeconds,
    intervalLengthMin,
  } = params

  if (arrivalsPerInterval <= 0) return 0

  const lam = arrivalsPerInterval / intervalLengthMin
  const mu = 1.0 / ahtMinutes
  const a = lam / mu
  const t = slaSeconds / 60.0
  const theta = 1.0 / (patienceSeconds / 60.0)
  const TARGET = slaFraction
  const TOL = 0.03

  const start = Math.max(1, Math.ceil(a))
  let bestC: number | null = null
  let bestScore = Infinity

  for (let c = start; c < 250; c++) {
    const { pAbandon, slaEst } = erlangAEstimates(a, c, mu, theta, t)

    if (pAbandon > abandonFraction) continue

    const slaGap = Math.abs(slaEst - TARGET)
    const penalty = slaEst > TARGET ? slaGap * 1.8 : slaGap

    if (penalty < bestScore) {
      bestScore = penalty
      bestC = c
    }
  }

  return bestC ?? start
}
