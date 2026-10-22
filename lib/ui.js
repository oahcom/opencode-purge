// ANSI helpers. No dependency, disabled automatically when NO_COLOR is set.

const enabled = !process.env.NO_COLOR

const wrap = (code) => (s) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : String(s))

export const c = {
  ok: wrap(32),
  dim: wrap(2),
  warn: wrap(33),
  err: wrap(31),
  b: wrap(1),
}
