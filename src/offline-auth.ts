type Access = { name: string; role: string }
type Credential = Access & { salt: number[]; digest: number[]; expires: number }
const key = 'purela.offline.credentials.v1'
const derive = async (password: string, salt: Uint8Array) => {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return [...new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as Uint8Array<ArrayBuffer>, iterations: 210000, hash: 'SHA-256' }, material, 256))]
}
export async function rememberAccess(identifier: string, password: string, access: Access) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const credentials = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, Credential>
  const value = { ...access, salt: [...salt], digest: await derive(password, salt), expires: Date.now() + 7 * 86400000 }
  credentials[identifier.trim().toLowerCase()] = value
  localStorage.setItem(key, JSON.stringify(credentials))
}
export async function offlineAccess(identifier: string, password: string): Promise<Access | null> {
  try {
    const credentials = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, Credential>
    const value = credentials[identifier.trim().toLowerCase()]
    if (!value || value.expires < Date.now()) return null
    const digest = await derive(password, new Uint8Array(value.salt))
    if (digest.length !== value.digest.length || digest.some((byte, index) => byte !== value.digest[index])) return null
    return { name: value.name, role: value.role }
  } catch { return null }
}
