/** Shared result type used by both UKDLVerifier and VerificationResult */
export interface PatternCheckResult {
  id:      string
  name:    string
  passed:  boolean
  detail:  string
  weight:  number  // percentage weight towards total score
}
