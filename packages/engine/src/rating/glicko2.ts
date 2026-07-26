/**
 * Glicko-2, following Glickman's published algorithm.
 *
 * Elo treats every rating as equally trustworthy. Glicko-2 does not: it carries
 * a deviation saying how sure it is, and a volatility saying how erratic the
 * competitor has been. That matters for exactly the case Elo handles worst — a
 * newcomer, or somebody returning after a year away.
 *
 * Ratings update per *rating period*, not per match, so a competitor's whole
 * round is evaluated against the ratings everyone held at the start of it.
 */

const SCALE = 173.7178;
const CONVERGENCE = 0.000001;

export interface Glicko2Player {
  rating: number;
  deviation: number;
  volatility: number;
}

export interface Glicko2Result {
  /** The opponent as they were at the start of the period. */
  opponent: Glicko2Player;
  /** 1 win, 0.5 draw, 0 loss. */
  score: number;
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expected(mu: number, opponentMu: number, opponentPhi: number): number {
  return 1 / (1 + Math.exp(-g(opponentPhi) * (mu - opponentMu)));
}

/**
 * Solve for the new volatility by the Illinois variant of regula falsi, exactly
 * as step 5 of the paper prescribes.
 */
function newVolatility(
  phi: number,
  sigma: number,
  v: number,
  delta: number,
  tau: number,
): number {
  const a = Math.log(sigma * sigma);
  const phiSq = phi * phi;
  const deltaSq = delta * delta;

  const f = (x: number): number => {
    const ex = Math.exp(x);
    const numerator = ex * (deltaSq - phiSq - v - ex);
    const denominator = 2 * (phiSq + v + ex) ** 2;
    return numerator / denominator - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;

  if (deltaSq > phiSq + v) {
    B = Math.log(deltaSq - phiSq - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k += 1;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);

  let guard = 0;
  while (Math.abs(B - A) > CONVERGENCE && guard < 200) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);

    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }

    B = C;
    fB = fC;
    guard += 1;
  }

  return Math.exp(A / 2);
}

/**
 * Update one competitor for one rating period.
 *
 * With no results, only the deviation grows — uncertainty increases when
 * somebody is not playing, which is the whole point of tracking it.
 */
export function glicko2Update(
  player: Glicko2Player,
  results: readonly Glicko2Result[],
  tau: number,
): Glicko2Player {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.deviation / SCALE;
  const sigma = player.volatility;

  if (results.length === 0) {
    const phiPrime = Math.sqrt(phi * phi + sigma * sigma);
    return {
      rating: player.rating,
      deviation: phiPrime * SCALE,
      volatility: sigma,
    };
  }

  let vInverse = 0;
  let deltaSum = 0;

  for (const result of results) {
    const opponentMu = (result.opponent.rating - 1500) / SCALE;
    const opponentPhi = result.opponent.deviation / SCALE;
    const gPhi = g(opponentPhi);
    const e = expected(mu, opponentMu, opponentPhi);

    vInverse += gPhi * gPhi * e * (1 - e);
    deltaSum += gPhi * (result.score - e);
  }

  const v = 1 / vInverse;
  const delta = v * deltaSum;

  const sigmaPrime = newVolatility(phi, sigma, v, delta, tau);
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  return {
    rating: muPrime * SCALE + 1500,
    deviation: phiPrime * SCALE,
    volatility: sigmaPrime,
  };
}
