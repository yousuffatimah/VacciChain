(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-BATCH-ID u101)
(define-constant ERR-BATCH-NOT-FOUND u102)
(define-constant ERR-INVALID-TEMP u103)
(define-constant ERR-INVALID-EXPIRY u104)
(define-constant ERR-INVALID-STATUS u105)
(define-constant ERR-BATCH-ALREADY-MINTED u106)
(define-constant ERR-INVALID-METADATA u107)
(define-constant ERR-INVALID-OWNER u108)
(define-constant ERR-TRANSFER-FAILED u109)
(define-constant ERR-INVALID-VACCINE-TYPE u110)
(define-constant ERR-INVALID-DOSE-COUNT u111)
(define-constant ERR-INVALID-PRODUCTION-DATE u112)
(define-constant ERR-INVALID-EXPIRATION-DATE u113)
(define-constant ERR-INVALID-MANUFACTURER u114)
(define-constant ERR-INVALID-STORAGE-REQ u115)
(define-constant ERR-INVALID-TRANSPORT-MODE u116)
(define-constant ERR-INVALID-ORIGIN u117)
(define-constant ERR-INVALID-DESTINATION u118)
(define-constant ERR-INVALID-STATUS-UPDATE u119)
(define-constant ERR-MAX-BATCHES-EXCEEDED u120)

(define-data-var next-batch-id uint u0)
(define-data-var max-batches uint u100000)
(define-data-var mint-fee uint u1000)
(define-data-var authority-contract (optional principal) none)

(define-non-fungible-token vaccine-batch uint)

(define-map batch-metadata
  uint
  {
    vaccine-type: (string-utf8 50),
    dose-count: uint,
    production-date: uint,
    expiration-date: uint,
    manufacturer: (string-utf8 100),
    storage-min: int,
    storage-max: int,
    transport-mode: (string-ascii 20),
    origin: (string-utf8 100),
    destination: (string-utf8 100),
    status: (string-ascii 20),
    compromised: bool
  }
)

(define-map batch-owners uint principal)

(define-read-only (get-batch-metadata (batch-id uint))
  (map-get? batch-metadata batch-id)
)

(define-read-only (get-batch-owner (batch-id uint))
  (nft-get-owner vaccine-batch batch-id)
)

(define-read-only (get-current-status (batch-id uint))
  (match (map-get? batch-metadata batch-id)
    data (get status data)
    "none"
  )
)

(define-read-only (is-batch-compromised (batch-id uint))
  (match (map-get? batch-metadata batch-id)
    data (get compromised data)
    false
  )
)

(define-private (validate-batch-id (id uint))
  (if (> id u0)
      (ok true)
      (err ERR-INVALID-BATCH-ID))
)

(define-private (validate-vaccine-type (typ (string-utf8 50)))
  (if (and (> (len typ) u0) (<= (len typ) u50))
      (ok true)
      (err ERR-INVALID-VACCINE-TYPE))
)

(define-private (validate-dose-count (count uint))
  (if (> count u0)
      (ok true)
      (err ERR-INVALID-DOSE-COUNT))
)

(define-private (validate-production-date (date uint))
  (if (<= date block-height)
      (ok true)
      (err ERR-INVALID-PRODUCTION-DATE))
)

(define-private (validate-expiration-date (date uint))
  (if (> date block-height)
      (ok true)
      (err ERR-INVALID-EXPIRATION-DATE))
)

(define-private (validate-manufacturer (man (string-utf8 100)))
  (if (and (> (len man) u0) (<= (len man) u100))
      (ok true)
      (err ERR-INVALID-MANUFACTURER))
)

(define-private (validate-storage-temp (temp int))
  (if (and (>= temp -50) (<= temp 50))
      (ok true)
      (err ERR-INVALID-TEMP))
)

(define-private (validate-transport-mode (mode (string-ascii 20)))
  (if (or (is-eq mode "air") (is-eq mode "sea") (is-eq mode "road") (is-eq mode "rail"))
      (ok true)
      (err ERR-INVALID-TRANSPORT-MODE))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-status (stat (string-ascii 20)))
  (if (or (is-eq stat "produced") (is-eq stat "in-transit") (is-eq stat "delivered") (is-eq stat "compromised"))
      (ok true)
      (err ERR-INVALID-STATUS))
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

(define-public (set-mint-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set mint-fee new-fee)
    (ok true)
  )
)

(define-public (mint-batch
  (vaccine-type (string-utf8 50))
  (dose-count uint)
  (production-date uint)
  (expiration-date uint)
  (manufacturer (string-utf8 100))
  (storage-min int)
  (storage-max int)
  (transport-mode (string-ascii 20))
  (origin (string-utf8 100))
  (destination (string-utf8 100))
)
  (let (
        (batch-id (var-get next-batch-id))
        (current-max (var-get max-batches))
        (authority (unwrap! (var-get authority-contract) (err ERR-NOT-AUTHORIZED)))
      )
    (asserts! (< batch-id current-max) (err ERR-MAX-BATCHES-EXCEEDED))
    (try! (validate-vaccine-type vaccine-type))
    (try! (validate-dose-count dose-count))
    (try! (validate-production-date production-date))
    (try! (validate-expiration-date expiration-date))
    (asserts! (> expiration-date production-date) (err ERR-INVALID-EXPIRATION-DATE))
    (try! (validate-manufacturer manufacturer))
    (try! (validate-storage-temp storage-min))
    (try! (validate-storage-temp storage-max))
    (asserts! (> storage-max storage-min) (err ERR-INVALID-TEMP))
    (try! (validate-transport-mode transport-mode))
    (try! (validate-location origin))
    (try! (validate-location destination))
    (try! (stx-transfer? (var-get mint-fee) tx-sender authority))
    (try! (nft-mint? vaccine-batch batch-id tx-sender))
    (map-set batch-metadata batch-id
      {
        vaccine-type: vaccine-type,
        dose-count: dose-count,
        production-date: production-date,
        expiration-date: expiration-date,
        manufacturer: manufacturer,
        storage-min: storage-min,
        storage-max: storage-max,
        transport-mode: transport-mode,
        origin: origin,
        destination: destination,
        status: "produced",
        compromised: false
      }
    )
    (map-set batch-owners batch-id tx-sender)
    (var-set next-batch-id (+ batch-id u1))
    (print { event: "batch-minted", id: batch-id, owner: tx-sender })
    (ok batch-id)
  )
)

(define-public (transfer-batch (batch-id uint) (recipient principal))
  (let ((owner (unwrap! (nft-get-owner vaccine-batch batch-id) (err ERR-BATCH-NOT-FOUND))))
    (asserts! (is-eq tx-sender owner) (err ERR-NOT-AUTHORIZED))
    (try! (nft-transfer? vaccine-batch batch-id tx-sender recipient))
    (map-set batch-owners batch-id recipient)
    (print { event: "batch-transferred", id: batch-id, from: tx-sender, to: recipient })
    (ok true)
  )
)

(define-public (update-batch-status (batch-id uint) (new-status (string-ascii 20)))
  (let ((owner (unwrap! (nft-get-owner vaccine-batch batch-id) (err ERR-BATCH-NOT-FOUND)))
        (metadata (unwrap! (map-get? batch-metadata batch-id) (err ERR-BATCH-NOT-FOUND))))
    (asserts! (is-eq tx-sender owner) (err ERR-NOT-AUTHORIZED))
    (try! (validate-status new-status))
    (map-set batch-metadata batch-id (merge metadata { status: new-status }))
    (print { event: "status-updated", id: batch-id, status: new-status })
    (ok true)
  )
)

(define-public (flag-compromised (batch-id uint))
  (let ((metadata (unwrap! (map-get? batch-metadata batch-id) (err ERR-BATCH-NOT-FOUND)))
        (authority (unwrap! (var-get authority-contract) (err ERR-NOT-AUTHORIZED))))
    (asserts! (is-eq tx-sender authority) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get compromised metadata)) (err ERR-INVALID-STATUS-UPDATE))
    (map-set batch-metadata batch-id (merge metadata { compromised: true, status: "compromised" }))
    (print { event: "batch-compromised", id: batch-id })
    (ok true)
  )
)

(define-public (get-batch-count)
  (ok (var-get next-batch-id))
)