# LIVEBET — System Architecture Mapping

## 14-System Audit & Status

| # | System | Status | Implementation |
|---|--------|--------|----------------|
| 1 | Registration (Email/Password/Phone/Google) | ✅ Complete | `AuthPage.tsx`, Supabase Auth |
| 2 | Device Fingerprinting & Tracking | ✅ Complete | `useDeviceTracking.ts`, `user_device_sessions` table |
| 3 | KYC (Level 0/1/2) | ✅ Complete | `useKyc.ts`, `KycVerificationFlow.tsx`, `kyc_documents` table |
| 4 | Wallet (Main + Bonus + Locked) | ✅ Complete | `useWallet.ts`, `useLockedFunds.ts`, `wallet_balances`, `locked_funds` tables |
| 5 | Payment Methods (UPI/Bank/Card) | ✅ Complete | `usePaymentMethods.ts`, `payment_methods` table |
| 6 | Auth & Security (2FA placeholder, Login Anomaly) | ✅ Complete | `useLoginAnomalyDetection.ts`, `login_events` table |
| 7 | Session Management | ✅ Complete | `useActiveSessions.ts`, `user_device_sessions` table |
| 8 | Account Status States (5 states) | ✅ Complete | `useAccountStatus.ts`, `user_risk_profiles` table |
| 9 | Risk Scoring System | ✅ Complete | `AdminRiskDashboard.tsx`, recalculate from bet history |
| 10 | Multi-Account Detection | ✅ Complete | `AdminMultiAccountDetection.tsx`, `detect_multi_accounts()` |
| 11 | Limits & Restrictions | ✅ Complete | `useBetLimits.ts`, `useWithdrawalLimits.ts`, `bet_limits` table |
| 12 | Notification System | ✅ Complete | `useNotifications.ts`, `useNotificationPreferences.ts` |
| 13 | Account Recovery | ✅ Complete | `useAccountRecovery.ts`, `AdminRecoveryRequests.tsx` |
| 14 | Affiliate/Referral Tagging | ✅ Complete | `useAffiliateTracking.ts`, `affiliates`, `user_referrals`, `referral_rewards` tables |

---

## System Details

### 1. Registration Layer
**Files:** `src/pages/auth/AuthPage.tsx`

- **Email + Password** → `supabase.auth.signUp()` / `signInWithPassword()`
- **Phone OTP** → `supabase.auth.signInWithOtp()` / `verifyOtp()`
- **Google OAuth** → `lovable.auth.signInWithOAuth("google")`

**Hidden mechanics on registration:**
- Device fingerprint captured via `useDeviceTracking` (browser, OS, screen, timezone)
- Referral/affiliate params captured from URL via `captureReferralParams()` in `main.tsx`
- UTM tracking (source, medium, campaign) stored in `user_referrals`
- Risk profile auto-created via `handle_new_user()` trigger
- Default notification preferences auto-created
- ₹1,000 welcome bonus credited to wallet

### 2. Device Fingerprinting
**Files:** `src/hooks/useDeviceTracking.ts`, `src/hooks/useLoginAnomalyDetection.ts`

**Table:** `user_device_sessions`
- `device_fingerprint` — hash of UA + screen + timezone + language + platform
- `ip_address` — captured server-side
- `user_agent`, `screen_resolution`, `timezone`
- `last_seen_at` — updated on each login

**Anomaly Detection** (`useLoginAnomalyDetection`):
- Detects new devices (fingerprint not seen before)
- Detects timezone mismatches (possible VPN)
- Detects multiple simultaneous sessions (>2 in 5 min)
- Flags stored in `login_events.risk_flags` and propagated to `user_risk_profiles.flags`

### 3. KYC System
**Files:** `src/hooks/useKyc.ts`, `src/components/kyc/`

| Level | Requirements | Withdrawal Limit |
|-------|-------------|-----------------|
| 0 | None | ₹0 (blocked) |
| 1 | PAN + Aadhaar + DOB | ₹10,000/day |
| 2 | ID docs + address proof + selfie | Unlimited |

**Tables:** `profiles` (KYC fields), `kyc_documents`
**Admin:** `AdminKycReview.tsx` — approve/reject docs

### 4. Wallet System
**Files:** `src/hooks/useWallet.ts`, `src/hooks/useLockedFunds.ts`

| Wallet Type | Table Column | Purpose |
|-------------|-------------|---------|
| Main | `wallet_balances.balance` | Real money, betting, deposits |
| Bonus | `wallet_balances.bonus_balance` | Wagering-requirement funds |
| Locked | `wallet_balances.locked_balance` | Held/frozen funds |

**Lock Reasons:** `wagering_requirement`, `suspicious_activity`, `withdrawal_pending`, `bonus_lock`, `admin_hold`

**Real-time:** Wallet balance updates via Supabase realtime subscription on `wallet_balances` table.

### 5. Payment Methods
**Files:** `src/hooks/usePaymentMethods.ts`

**Types:** `upi`, `bank_account`, `card`
**Features:** Default method selection, verified flag, details stored as JSONB

### 6. Auth & Security
**Files:** `src/pages/auth/AuthPage.tsx`, `src/hooks/useLoginAnomalyDetection.ts`

- Password login + OTP login + Google OAuth
- Login event logging with anomaly flags
- Active session management (view/revoke devices)
- 2FA button exists (implementation requires TOTP backend)
- Password reset via Supabase email flow

### 7. Session Management
**Files:** `src/hooks/useActiveSessions.ts`

Users can:
- View all active device sessions
- See device type, screen size, timezone, last seen
- Revoke any session (deletes device record)

### 8. Account Status States
**Files:** `src/hooks/useAccountStatus.ts`

| State | Can Bet | Can Withdraw | Description |
|-------|---------|-------------|-------------|
| active | ✅ | ✅ | Normal operation |
| restricted | ✅ | ✅ | Limited markets/amounts |
| suspended | ❌ | ❌ | Account frozen |
| under_review | ❌ | ✅ | Manual review in progress |
| blocked | ❌ | ❌ | Permanent ban |

### 9. Risk Scoring
**Files:** `src/components/admin/AdminRiskDashboard.tsx`

**Score components (0-100):**
- Win rate: up to 40 pts
- Profit amount: up to 20 pts
- Low odds pattern (arbing): 10 pts
- High stake frequency: up to 15 pts
- Bet volume: up to 15 pts

**Levels:** low (0-24), medium (25-49), high (50-74), critical (75-100)

### 10. Multi-Account Detection
**Files:** `src/components/admin/AdminMultiAccountDetection.tsx`

**Detection methods:**
| Method | Confidence | Source |
|--------|-----------|--------|
| Same device fingerprint | 90% | `user_device_sessions` |
| Same IP address | 60% | `user_device_sessions` |
| Same payment details | 85% | `payment_methods` |
| Same KYC (PAN/Aadhaar) | 95% | `profiles` |

**Actions:** flag → freeze → ban (or dismiss)

### 11. Limits & Restrictions
**Files:** `src/hooks/useBetLimits.ts`, `src/hooks/useWithdrawalLimits.ts`

- Global bet limits: min/max stake, max win (configurable by admin)
- Per-user overrides via `user_risk_profiles.max_bet_override`
- KYC-based withdrawal limits
- Market suspensions via `market_suspensions` table
- Blocked markets per user via `user_risk_profiles.blocked_markets`

### 12. Notification System
**Files:** `src/hooks/useNotifications.ts`, `src/hooks/useNotificationPreferences.ts`

**Channels:** in_app, email, sms
**Categories:** bet_results, promotions, odds_alerts, transactions, security

Real-time via Supabase realtime subscriptions. Users can toggle each channel × category combination.

### 13. Account Recovery
**Files:** `src/hooks/useAccountRecovery.ts`, `src/components/admin/AdminRecoveryRequests.tsx`

- Password reset via Supabase OTP email flow
- Manual recovery request submission (for locked-out users)
- Admin review with status: pending → verified → completed/rejected

### 14. Affiliate/Referral Tagging
**Files:** `src/hooks/useAffiliateTracking.ts`

**URL params captured:** `?ref=CODE`, `?aff=CODE`, `utm_source`, `utm_medium`, `utm_campaign`

**Flow:**
1. `captureReferralParams()` runs before React (in `main.tsx`)
2. Stores params in `sessionStorage`
3. After auth, `useAffiliateTracking` writes to `user_referrals` table
4. Looks up affiliate by code, or referrer by user code
5. Each user gets their own referral code (first 8 chars of user ID)

**Tables:** `affiliates`, `user_referrals`, `referral_rewards`

### 15. Behavioral Analytics (Bonus System)
**Files:** `src/hooks/useBehaviorTracking.ts`

**Events tracked:**
- `session_start` — screen size, timezone, referrer
- `page_view` — path, timestamp
- `page_view_end` — duration on page

**Tables:** `user_behavior_events`, `user_behavior_stats` (aggregated)

---

## Database Schema Summary

### Core Tables
- `profiles` — user info, KYC fields
- `wallet_balances` — balance, bonus_balance, locked_balance
- `transactions` — full financial ledger
- `bets` — bet records
- `bet_limits` — global betting limits

### Security Tables
- `user_risk_profiles` — risk score, account status, flags
- `user_device_sessions` — fingerprints, devices
- `login_events` — login audit trail with anomaly flags
- `linked_accounts` — multi-account detection results
- `locked_funds` — individual fund locks with reasons

### KYC Tables
- `kyc_documents` — uploaded verification documents

### Notification Tables
- `notifications` — in-app notification records
- `notification_preferences` — per-channel/category toggles

### Recovery Tables
- `account_recovery_requests` — manual support requests

### Affiliate Tables
- `affiliates` — affiliate partners
- `user_referrals` — user signup attribution
- `referral_rewards` — referral bonus tracking

### Analytics Tables
- `user_behavior_events` — raw event stream
- `user_behavior_stats` — aggregated user metrics

### Admin Tables
- `user_roles` — role-based access (admin, moderator, user)
- `market_suspensions` — suspended betting markets

---

## Migration Files

1. **Existing:** `src/sql/behavior_tracking_migration.sql` — risk profiles, device sessions, linked accounts, notification preferences, recovery requests
2. **New:** `src/sql/missing_systems_migration.sql` — affiliates, locked funds, login events, behavioral analytics
