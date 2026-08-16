const USER_ID_KEY = 'whereami.userId'

// sessionStorage rather than localStorage: each browser tab is then a different applicant,
// which is how several people are tested against one job

export function readUserId(): string | null {
  return sessionStorage.getItem(USER_ID_KEY)
}

export function writeUserId(userId: string): void {
  sessionStorage.setItem(USER_ID_KEY, userId)
}

export function clearUserId(): void {
  sessionStorage.removeItem(USER_ID_KEY)
}
