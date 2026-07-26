/**
 * A TrueSkill-style rating.
 *
 * Where Elo asks "who won", this asks "how surprising was that", and carries an
 * uncertainty it narrows as evidence accumulates. It is the better fit for
 * video games and free-for-all formats, where results are noisy and fields are
 * large.
 *
 * This is the standard two-player update. Free-for-all results are handled by
 * applying it between adjacent finishing positions rather than by solving the
 * full factor graph, which is a real simplification: it captures "you beat the
 * person just above you" but not the weaker evidence of finishing far ahead of
 * somebody at the back. It is well behaved and monotonic, and it is what the
 * ranking is used for here — ordering a field, not modelling it exactly.
 */

import { cdf, invCdf, pdf } from "./gaussian.js";

export interface TrueSkillPlayer {
  mu: number;
  sigma: number;
}

export interface TrueSkillConfig {
  beta: number;
  tau: number;
  drawProbability: number;
}

/**
 * pdf/cdf, guarded against underflow.
 *
 * For a very unlikely result the denominator collapses to zero. The ratio tends
 * to -x there, which is the limit the approximation should return rather than
 * an infinity that would poison every rating downstream.
 */
function ratio(x: number): number {
  const denominator = cdf(x);
  if (denominator < 1e-12) return Math.max(-x, 0);
  return pdf(x) / denominator;
}

function vWin(t: number, epsilon: number): number {
  return ratio(t - epsilon);
}

function wWin(t: number, epsilon: number): number {
  const v = vWin(t, epsilon);
  const w = v * (v + t - epsilon);
  return Math.min(1, Math.max(0, w));
}

function vDraw(t: number, epsilon: number): number {
  const a = epsilon - t;
  const b = -epsilon - t;
  const denominator = cdf(a) - cdf(b);
  if (denominator < 1e-12) return t < 0 ? -t - epsilon : -t + epsilon;
  return (pdf(b) - pdf(a)) / denominator;
}

function wDraw(t: number, epsilon: number): number {
  const a = epsilon - t;
  const b = -epsilon - t;
  const denominator = cdf(a) - cdf(b);
  if (denominator < 1e-12) return 1;
  const v = vDraw(t, epsilon);
  const w = v * v + (a * pdf(a) - b * pdf(b)) / denominator;
  return Math.min(1, Math.max(0, w));
}

/** The performance gap below which a result is treated as a draw. */
export function drawMargin(config: TrueSkillConfig): number {
  return invCdf((config.drawProbability + 1) / 2) * Math.SQRT2 * config.beta;
}

/**
 * One result between two competitors, `winner` listed first. A draw updates
 * both towards each other instead of apart.
 */
export function trueSkillUpdate(
  winner: TrueSkillPlayer,
  loser: TrueSkillPlayer,
  config: TrueSkillConfig,
  isDraw = false,
): { winner: TrueSkillPlayer; loser: TrueSkillPlayer } {
  // Uncertainty creeps back in between matches: people improve and decline.
  const sigmaW = Math.sqrt(winner.sigma ** 2 + config.tau ** 2);
  const sigmaL = Math.sqrt(loser.sigma ** 2 + config.tau ** 2);

  const cSquared = 2 * config.beta ** 2 + sigmaW ** 2 + sigmaL ** 2;
  const c = Math.sqrt(cSquared);
  const t = (winner.mu - loser.mu) / c;
  const epsilon = drawMargin(config);

  const v = isDraw ? vDraw(t, epsilon) : vWin(t, epsilon);
  const w = isDraw ? wDraw(t, epsilon) : wWin(t, epsilon);

  return {
    winner: {
      mu: winner.mu + (sigmaW ** 2 / c) * v,
      sigma: sigmaW * Math.sqrt(Math.max(1e-6, 1 - (sigmaW ** 2 / cSquared) * w)),
    },
    loser: {
      mu: loser.mu - (sigmaL ** 2 / c) * v,
      sigma: sigmaL * Math.sqrt(Math.max(1e-6, 1 - (sigmaL ** 2 / cSquared) * w)),
    },
  };
}

/**
 * A conservative single number for ranking and display: the level we are
 * reasonably sure the competitor is at least at, rather than our best guess.
 * A newcomer with a wild rating does not jump the table on one good night.
 */
export function conservativeRating(player: TrueSkillPlayer): number {
  return player.mu - 3 * player.sigma;
}
