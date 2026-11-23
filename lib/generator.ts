export const CHARACTER_SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789', symbols: '!@#$%^&*()-_=+[]{}:;,.?',
}
export type GeneratorOptions = { length: number; uppercase: boolean; lowercase: boolean; numbers: boolean; symbols: boolean }
export const DEFAULT_GENERATOR: GeneratorOptions = { length: 20, uppercase: true, lowercase: true, numbers: true, symbols: true }

// Rejection sampling avoids modulo bias. All randomness comes from Web Crypto.
export function randomIndex(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 65536) throw new Error('Invalid random range.')
  const cutoff = Math.floor(0x1_0000_0000 / limit) * limit
  const value = new Uint32Array(1)
  do { crypto.getRandomValues(value) } while (value[0] >= cutoff)
  return value[0] % limit
}
export function generatePassword(options: GeneratorOptions = DEFAULT_GENERATOR): string {
  if (!Number.isInteger(options.length) || options.length < 8 || options.length > 128) throw new Error('Choose a length between 8 and 128.')
  const groups = (Object.keys(CHARACTER_SETS) as (keyof typeof CHARACTER_SETS)[]).filter(key => options[key]).map(key => CHARACTER_SETS[key])
  if (!groups.length) throw new Error('Select at least one character type.')
  const pool = groups.join('')
  // Reject samples missing a required class instead of introducing shuffle bias.
  for (;;) {
    const password = Array.from({ length: options.length }, () => pool[randomIndex(pool.length)]).join('')
    if (groups.every(group => [...password].some(char => group.includes(char)))) return password
  }
}
const WORDS = `acorn anchor apple apron arctic arrow atlas autumn badge bamboo basket beacon berry birch bloom blue boat bonus bottle breeze brick bridge brook bronze brush cabin cactus candle canvas canyon cargo cedar cherry chess citrus cloud clover coast cocoa comet coral cotton crane creek crown crystal daisy dawn delta desert dream drift dune eagle earth echo elm ember falcon feather fern field finch flame flint flower forest fossil fox frost garden garnet gate ginger glacier globe gold grain grape grass grove harbor hazel hedge heron hill honey horizon horse iceberg indigo iris island ivory jade jasmine jigsaw juniper kettle kite kiwi lagoon lake lantern lark laurel leaf lemon lilac lily lime linen lion lotus lunar maple marble meadow melon mint mist moon moss mountain nectar nest night north oak ocean olive onyx opal orbit orchid otter owl oyster palm panda paper peach pearl pebble pepper petal pine plum pond poppy prism quartz quest quill rabbit rain raven reef river robin rock rose ruby sage sail salt sand satin scarlet seed shade shell shore silver sky slate snow solar song sparrow spice spring spruce star stone storm stream sugar summit sun sunset surf swan swift table tea thistle thorn tide tiger timber topaz trail tree tulip valley velvet violet walnut water wave wax wheat willow wind wing winter wolf wood wren yarn yellow zebra zenith`.split(' ')
export function generatePassphrase(count = 10): string {
  if (!Number.isInteger(count) || count < 6 || count > 16) throw new Error('Choose 6–16 words.')
  return Array.from({ length: count }, () => WORDS[randomIndex(WORDS.length)]).join('-')
}
export const passphraseBits = (count: number) => Math.floor(Math.log2(WORDS.length) * count)

export function masterPasswordProblem(password: string): string | null {
  if (password.length < 12) return 'Use at least 12 characters for your master password.'
  if (password.length > 1024) return 'Use at most 1024 characters for your master password.'
  if (passwordStrength(password).score < 3) return 'This master password is too easy to guess. Avoid common words, repeats and patterns, or use a passphrase from the generator.'
  return null
}

export function passwordStrength(password: string): { score: number; label: string } {
  if (!password) return { score: 0, label: 'Not set' }
  const unique = new Set(password.toLowerCase()).size
  const common = /password|qwerty|123456|letmein|welcome|admin|abc123/i.test(password)
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter(re => re.test(password)).length
  let score = password.length >= 20 && unique >= 10 ? 4 : password.length >= 14 && classes >= 3 && unique >= 8 ? 4 : password.length >= 12 && unique >= 7 ? 3 : password.length >= 10 && classes >= 2 ? 2 : 1
  if (common || unique < 5 || /(.)\1{4}/.test(password)) score = 1
  return { score, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][score] }
}
