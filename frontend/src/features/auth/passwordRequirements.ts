export function passwordRequirementError(password: string) {
  if (password.length < 14) return 'A nova senha precisa ter pelo menos 14 caracteres.'
  if (!/\p{Ll}/u.test(password) || !/\p{Lu}/u.test(password) || !/\p{Nd}/u.test(password) || !/[^\p{L}\p{N}]/u.test(password)) return 'Use letra maiúscula, letra minúscula, número e símbolo na nova senha.'
  return null
}
