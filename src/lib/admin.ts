export const ADMIN_EMAIL = 'fa.leonard@gmail.com'

export function isAdmin(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === ADMIN_EMAIL
}
