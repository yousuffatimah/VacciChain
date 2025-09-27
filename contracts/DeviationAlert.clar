(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-BATCH-ID u101)
(define-constant ERR-INVALID-TEMP u102)
(define-constant ERR-INVALID-MIN-TEMP u103)
(define-constant ERR-INVALID-MAX-TEMP u104)
(define-constant ERR-INVALID-THRESHOLD u105)
(define-constant ERR-ALERT-ALREADY-EXISTS u106)
(define-constant ERR-ALERT-NOT-FOUND u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-ORACLE-NOT-VERIFIED u109)
(define-constant ERR-INVALID-DEVIATION-COUNT u110)
(define-constant ERR-INVALID-PENALTY-AMOUNT u111)
(define-constant ERR-BATCH-NOT-ACTIVE u112)
(define-constant ERR-INVALID-UPDATE-PARAM u113)
(define-constant ERR-MAX-ALERTS-EXCEEDED u114)
(define-constant ERR-INVALID-ALERT-TYPE u115)
(define-constant ERR-INVALID-SEVERITY u116)
(define-constant ERR-INVALID-GRACE-PERIOD u117)
(define-constant ERR-INVALID-LOCATION u118)
(define-constant ERR-INVALID-SENSOR-ID u119)
(define-constant ERR-INVALID-STATUS u120)

(define-data-var next-alert-id uint u0)
(define-data-var max-alerts uint u10000)
(define-data-var alert-fee uint u500)
(define-data-var oracle-contract (optional principal) none)

(define-map batch-rules
  uint
  {
    min-temp: int,
    max-temp: int,
    deviation-threshold: uint,
    grace-period: uint,
    active: bool
  }
)

(define-map alerts
  uint
  {
    batch-id: uint,
    temp-recorded: int,
    timestamp: uint,
    sensor-id: (string-ascii 50),
    location: (string-utf8 100),
    severity: uint,
    alert-type: (string-ascii 20),
    status: bool,
    penalty-applied: bool
  }
)

(define-map alerts-by-batch
  uint
  (list 100 uint)
)

(define-map deviation-counts
  uint
  uint
)

(define-read-only (get-batch-rules (batch-id uint))
  (map-get? batch-rules batch-id)
)

(define-read-only (get-alert (alert-id uint))
  (map-get? alerts alert-id)
)

(define-read-only (get-alerts-for-batch (batch-id uint))
  (default-to (list) (map-get? alerts-by-batch batch-id))
)

(define-read-only (get-deviation-count (batch-id uint))
  (default-to u0 (map-get? deviation-counts batch-id))
)

(define-private (validate-batch-id (id uint))
  (if (> id u0)
      (ok true)
      (err ERR-INVALID-BATCH-ID))
)

(define-private (validate-temp (temp int))
  (if (and (>= temp -50) (<= temp 50))
      (ok true)
      (err ERR-INVALID-TEMP))
)

(define-private (validate-min-temp (min int))
  (if (and (>= min -50) (<= min 50))
      (ok true)
      (err ERR-INVALID-MIN-TEMP))
)

(define-private (validate-max-temp (max int))
  (if (and (>= max -50) (<= max 50))
      (ok true)
      (err ERR-INVALID-MAX-TEMP))
)

(define-private (validate-threshold (thresh uint))
  (if (> thresh u0)
      (ok true)
      (err ERR-INVALID-THRESHOLD))
)

(define-private (validate-grace-period (period uint))
  (if (<= period u144)
      (ok true)
      (err ERR-INVALID-GRACE-PERIOD))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-sensor-id (id (string-ascii 50)))
  (if (and (> (len id) u0) (<= (len id) u50))
      (ok true)
      (err ERR-INVALID-SENSOR-ID))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-severity (sev uint))
  (if (<= sev u3)
      (ok true)
      (err ERR-INVALID-SEVERITY))
)

(define-private (validate-alert-type (typ (string-ascii 20)))
  (if (or (is-eq typ "high") (is-eq typ "low") (is-eq typ "extreme"))
      (ok true)
      (err ERR-INVALID-ALERT-TYPE))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-oracle-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get oracle-contract)) (err ERR-ORACLE-NOT-VERIFIED))
    (var-set oracle-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-alerts (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get oracle-contract)) (err ERR-ORACLE-NOT-VERIFIED))
    (var-set max-alerts new-max)
    (ok true)
  )
)

(define-public (set-alert-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get oracle-contract)) (err ERR-ORACLE-NOT-VERIFIED))
    (var-set alert-fee new-fee)
    (ok true)
  )
)

(define-public (set-batch-rules
  (batch-id uint)
  (min-temp int)
  (max-temp int)
  (deviation-threshold uint)
  (grace-period uint)
)
  (begin
    (try! (validate-batch-id batch-id))
    (try! (validate-min-temp min-temp))
    (try! (validate-max-temp max-temp))
    (asserts! (> max-temp min-temp) (err ERR-INVALID_MAX_TEMP))
    (try! (validate-threshold deviation-threshold))
    (try! (validate-grace-period grace-period))
    (asserts! (is-eq tx-sender (unwrap! (var-get oracle-contract) (err ERR-ORACLE-NOT-VERIFIED))) (err ERR-NOT-AUTHORIZED))
    (map-set batch-rules batch-id
      {
        min-temp: min-temp,
        max-temp: max-temp,
        deviation-threshold: deviation-threshold,
        grace-period: grace-period,
        active: true
      }
    )
    (print { event: "batch-rules-set", batch-id: batch-id })
    (ok true)
  )
)

(define-public (trigger-alert
  (batch-id uint)
  (temp-recorded int)
  (sensor-id (string-ascii 50))
  (location (string-utf8 100))
  (severity uint)
  (alert-type (string-ascii 20))
)
  (let (
        (rules (unwrap! (map-get? batch-rules batch-id) (err ERR-INVALID-BATCH-ID)))
        (next-id (var-get next-alert-id))
        (current-max (var-get max-alerts))
        (oracle (var-get oracle-contract))
        (dev-count (get-deviation-count batch-id))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-ALERTS-EXCEEDED))
    (asserts! (get active rules) (err ERR-BATCH-NOT-ACTIVE))
    (try! (validate-temp temp-recorded))
    (try! (validate-sensor-id sensor-id))
    (try! (validate-location location))
    (try! (validate-severity severity))
    (try! (validate-alert-type alert-type))
    (asserts! (is-eq tx-sender (unwrap! oracle (err ERR-ORACLE-NOT-VERIFIED))) (err ERR-NOT-AUTHORIZED))
    (let ((min-t (get min-temp rules)) (max-t (get max-temp rules)))
      (asserts! (or (< temp-recorded min-t) (> temp-recorded max-t)) (err ERR-INVALID_TEMP))
    )
    (try! (stx-transfer? (var-get alert-fee) tx-sender (unwrap! oracle (err ERR-ORACLE-NOT-VERIFIED))))
    (map-set alerts next-id
      {
        batch-id: batch-id,
        temp-recorded: temp-recorded,
        timestamp: block-height,
        sensor-id: sensor-id,
        location: location,
        severity: severity,
        alert-type: alert-type,
        status: true,
        penalty-applied: false
      }
    )
    (map-set alerts-by-batch batch-id (append (get-alerts-for-batch batch-id) next-id))
    (map-set deviation-counts batch-id (+ dev-count u1))
    (var-set next-alert-id (+ next-id u1))
    (print { event: "alert-triggered", id: next-id, batch-id: batch-id })
    (ok next-id)
  )
)

(define-public (resolve-alert (alert-id uint) (apply-penalty bool))
  (let ((alert (unwrap! (map-get? alerts alert-id) (err ERR_ALERT-NOT-FOUND)))
        (batch-id (get batch-id alert))
        (oracle (unwrap! (var-get oracle-contract) (err ERR-ORACLE-NOT-VERIFIED))))
    (asserts! (is-eq tx-sender oracle) (err ERR-NOT-AUTHORIZED))
    (asserts! (get status alert) (err ERR_INVALID_STATUS))
    (map-set alerts alert-id (merge alert { status: false, penalty-applied: apply-penalty }))
    (if apply-penalty
        (print { event: "penalty-applied", alert-id: alert-id, batch-id: batch-id })
        (print { event: "alert-resolved", alert-id: alert-id, batch-id: batch-id }))
    (ok true)
  )
)

(define-public (get-alert-count)
  (ok (var-get next-alert-id))
)

(define-public (is-batch-in-deviation (batch-id uint))
  (ok (> (get-deviation-count batch-id) u0))
)