(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-BATCH-ID u101)
(define-constant ERR-BATCH-NOT-FOUND u102)
(define-constant ERR-INSUFFICIENT-BALANCE u103)
(define-constant ERR-INVALID-AMOUNT u104)
(define-constant ERR-STAKE-LOCKED u105)
(define-constant ERR-INVALID-PENALTY u106)
(define-constant ERR-ALREADY-STAKED u107)
(define-constant ERR-NOT-STAKED u108)
(define-constant ERR-INVALID-REWARD-RATE u109)
(define-constant ERR-INVALID-LOCK-PERIOD u110)
(define-constant ERR-TRANSFER-FAILED u111)
(define-constant ERR-INVALID-STAKEHOLDER u112)
(define-constant ERR-MAX-STAKES-EXCEEDED u113)
(define-constant ERR-INVALID-ROLE u114)
(define-constant ERR-REWARD-ALREADY-CLAIMED u115)
(define-constant ERR-INVALID-CLAIM-PERIOD u116)
(define-constant ERR-INVALID-DISTRIBUTION u117)
(define-constant ERR-INSUFFICIENT-REWARDS u118)
(define-constant ERR-INVALID-STATUS u119)
(define-constant ERR-MAX-REWARDS-EXCEEDED u120)

(define-fungible-token vcc-reward)

(define-data-var total-supply uint u100000000000000)
(define-data-var reward-rate uint u100)
(define-data-var lock-period uint u20160)
(define-data-var next-stake-id uint u0)
(define-data-var max-stakes uint u50000)
(define-data-var authority-contract (optional principal) none)

(define-map stakes
  uint
  {
    batch-id: uint,
    amount: uint,
    staker: principal,
    start-height: uint,
    claimed: bool,
    role: (string-ascii 20)
  }
)

(define-map stake-by-batch uint (list 100 uint))
(define-map rewards-claimed uint bool)
(define-map total-staked-by-role (string-ascii 20) uint)

(define-read-only (get-token-balance (user principal))
  (ok (ft-get-balance vcc-reward user))
)

(define-read-only (get-total-supply)
  (ok (var-get total-supply))
)

(define-read-only (get-stake (stake-id uint))
  (map-get? stakes stake-id)
)

(define-read-only (get-stakes-by-batch (batch-id uint))
  (default-to (list) (map-get? stake-by-batch batch-id))
)

(define-read-only (get-total-staked (role (string-ascii 20)))
  (default-to u0 (map-get? total-staked-by-role role))
)

(define-private (validate-batch-id (id uint))
  (if (> id u0)
      (ok true)
      (err ERR-INVALID-BATCH-ID))
)

(define-private (validate-amount (amt uint))
  (if (> amt u0)
      (ok true)
      (err ERR-INVALID-AMOUNT))
)

(define-private (validate-lock-period (period uint))
  (if (and (>= period u1008) (<= period u52560))
      (ok true)
      (err ERR-INVALID-LOCK-PERIOD))
)

(define-private (validate-reward-rate (rate uint))
  (if (<= rate u1000)
      (ok true)
      (err ERR-INVALID-REWARD-RATE))
)

(define-private (validate-role (role (string-ascii 20)))
  (if (or (is-eq role "manufacturer") (is-eq role "distributor") (is-eq role "provider"))
      (ok true)
      (err ERR-INVALID-ROLE))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-reward-rate (new-rate uint))
  (begin
    (try! (validate-reward-rate new-rate))
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set reward-rate new-rate)
    (ok true)
  )
)

(define-public (set-lock-period (new-period uint))
  (begin
    (try! (validate-lock-period new-period))
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set lock-period new-period)
    (ok true)
  )
)

(define-public (mint-initial-supply (recipient principal))
  (let ((authority (unwrap! (var-get authority-contract) (err ERR-NOT-AUTHORIZED))))
    (asserts! (is-eq tx-sender authority) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (var-get total-supply) u100000000000000) (err ERR-INVALID-DISTRIBUTION))
    (try! (ft-mint? vcc-reward (var-get total-supply) recipient))
    (var-set total-supply u0)
    (ok true)
  )
)

(define-public (stake-tokens
  (batch-id uint)
  (amount uint)
  (role (string-ascii 20))
)
  (let (
        (stake-id (var-get next-stake-id))
        (current-max (var-get max-stakes))
        (authority (unwrap! (var-get authority-contract) (err ERR-NOT-AUTHORIZED)))
      )
    (asserts! (< stake-id current-max) (err ERR-MAX-STAKES-EXCEEDED))
    (try! (validate-batch-id batch-id))
    (try! (validate-amount amount))
    (try! (validate-role role))
    (try! (ft-transfer? vcc-reward amount tx-sender authority))
    (map-set stakes stake-id
      {
        batch-id: batch-id,
        amount: amount,
        staker: tx-sender,
        start-height: block-height,
        claimed: false,
        role: role
      }
    )
    (map-set stake-by-batch batch-id (append (get-stakes-by-batch batch-id) stake-id))
    (map-set total-staked-by-role role (+ (get-total-staked role) amount))
    (var-set next-stake-id (+ stake-id u1))
    (print { event: "tokens-staked", id: stake-id, batch-id: batch-id, amount: amount })
    (ok stake-id)
  )
)

(define-public (claim-reward (stake-id uint))
  (let (
        (stake (unwrap! (map-get? stakes stake-id) (err ERR-NOT-STAKED)))
        (authority (unwrap! (var-get authority-contract) (err ERR-NOT-AUTHORIZED)))
        (lock-end (+ (get start-height stake) (var-get lock-period)))
      )
    (asserts! (is-eq tx-sender (get staker stake)) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get claimed stake)) (err ERR-REWARD-ALREADY-CLAIMED))
    (asserts! (>= block-height lock-end) (err ERR-STAKE-LOCKED))
    (let ((reward (/ (* (get amount stake) (var-get reward-rate)) u10000)))
      (asserts! (>= (ft-get-balance vcc-reward authority) reward) (err ERR-INSUFFICIENT-REWARDS))
      (try! (ft-transfer? vcc-reward reward authority tx-sender))
      (map-set stakes stake-id (merge stake { claimed: true }))
      (print { event: "reward-claimed", stake-id: stake-id, amount: reward })
      (ok reward)
    )
  )
)

(define-public (slash-stake (stake-id uint) (penalty-rate uint))
  (let (
        (stake (unwrap! (map-get? stakes stake-id) (err ERR-NOT-STAKED)))
        (authority (unwrap! (var-get authority-contract) (err ERR-NOT-AUTHORIZED)))
      )
    (asserts! (is-eq tx-sender authority) (err ERR-NOT-AUTHORIZED))
    (asserts! (<= penalty-rate u10000) (err ERR-INVALID-PENALTY))
    (asserts! (not (get claimed stake)) (err ERR-REWARD-ALREADY-CLAIMED))
    (let ((penalty-amount (/ (* (get amount stake) penalty-rate) u10000))
          (remaining (- (get amount stake) penalty-amount)))
      (map-set stakes stake-id (merge stake { claimed: true }))
      (map-set total-staked-by-role (get role stake) (- (get-total-staked (get role stake)) (get amount stake)))
      (if (> remaining u0)
          (try! (ft-transfer? vcc-reward remaining authority (get staker stake)))
          (ok true)
      )
      (print { event: "stake-slashed", stake-id: stake-id, penalty: penalty-amount })
      (ok penalty-amount)
    )
  )
)

(define-public (get-stake-count)
  (ok (var-get next-stake-id))
)