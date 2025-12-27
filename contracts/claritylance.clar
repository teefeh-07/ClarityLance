;; ClarityLance
;; A decentralized freelance payment escrow system with milestone-based releases
;; Contract allows clients to create projects, freelancers to accept them,
;; and implements a milestone-based payment system with dispute resolution

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-already-exists (err u102))
(define-constant err-unauthorized (err u103))
(define-constant err-wrong-status (err u104))
(define-constant err-insufficient-funds (err u105))
(define-constant err-invalid-percentage (err u106))

;; Project status types
(define-data-var project-id-nonce uint u0)

;; Data Structures
(define-map projects 
    { project-id: uint }
    {
        client: principal,
        freelancer: (optional principal),
        total-amount: uint,
        milestone-count: uint,
        description: (string-utf8 500),
        status: (string-ascii 20),
        dispute-resolver: principal,
        created-at: uint
    }
)

(define-map milestones
    { project-id: uint, milestone-id: uint }
    {
        amount: uint,
        description: (string-utf8 256),
        status: (string-ascii 20),
        completion-proof: (optional (string-utf8 500))
    }
)

(define-map project-funds
    { project-id: uint }
    { 
        balance: uint,
        released: uint
    }
)

(define-map disputes
    { project-id: uint }
    {
        initiated-by: principal,
        reason: (string-utf8 500),
        resolver-fee: uint,
        resolved: bool
    }
)

;; Read-only functions
(define-read-only (get-project-details (project-id uint))
    (ok (unwrap! (map-get? projects {project-id: project-id}) err-not-found))
)

(define-read-only (get-milestone-details (project-id uint) (milestone-id uint))
    (ok (unwrap! (map-get? milestones {project-id: project-id, milestone-id: milestone-id}) err-not-found))
)

(define-read-only (get-project-balance (project-id uint))
    (ok (unwrap! (map-get? project-funds {project-id: project-id}) err-not-found))
)

;; Public functions
(define-public (create-project (description (string-utf8 500)) (total-amount uint) (milestone-count uint) (dispute-resolver principal))
    (let
        (
            (project-id (+ (var-get project-id-nonce) u1))
        )
        (asserts! (> total-amount u0) err-invalid-percentage)
        (asserts! (> milestone-count u0) err-invalid-percentage)
        
        (try! (stx-transfer? total-amount tx-sender (as-contract? tx-sender)))
        
        (map-set projects
            {project-id: project-id}
            {
                client: tx-sender,
                freelancer: none,
                total-amount: total-amount,
                milestone-count: milestone-count,
                description: description,
                status: "open",
                dispute-resolver: dispute-resolver,
                created-at: block-height
            }
        )
        
        (map-set project-funds
            {project-id: project-id}
            {
                balance: total-amount,
                released: u0
            }
        )
        
        (var-set project-id-nonce project-id)
        (ok project-id)
    )
)

(define-public (accept-project (project-id uint))
    (let
        (
            (project (unwrap! (map-get? projects {project-id: project-id}) err-not-found))
        )
        (asserts! (is-eq (get status project) "open") err-wrong-status)
        (asserts! (is-none (get freelancer project)) err-already-exists)
        
        (map-set projects
            {project-id: project-id}
            (merge project {
                freelancer: (some tx-sender),
                status: "in-progress"
            })
        )
        (ok true)
    )
)

(define-public (submit-milestone (project-id uint) (milestone-id uint) (completion-proof (string-utf8 500)))
    (let
        (
            (project (unwrap! (map-get? projects {project-id: project-id}) err-not-found))
            (milestone (unwrap! (map-get? milestones {project-id: project-id, milestone-id: milestone-id}) err-not-found))
        )
        (asserts! (is-eq (some tx-sender) (get freelancer project)) err-unauthorized)
        (asserts! (is-eq (get status milestone) "pending") err-wrong-status)
        
        (map-set milestones
            {project-id: project-id, milestone-id: milestone-id}
            (merge milestone {
                status: "submitted",
                completion-proof: (some completion-proof)
            })
        )
        (ok true)
    )
)

(define-public (approve-milestone (project-id uint) (milestone-id uint))
    (let
        (
            (project (unwrap! (map-get? projects {project-id: project-id}) err-not-found))
            (milestone (unwrap! (map-get? milestones {project-id: project-id, milestone-id: milestone-id}) err-not-found))
            (funds (unwrap! (map-get? project-funds {project-id: project-id}) err-not-found))
        )
        (asserts! (is-eq tx-sender (get client project)) err-unauthorized)
        (asserts! (is-eq (get status milestone) "submitted") err-wrong-status)
        
        ;; Release payment
        (try! (as-contract (stx-transfer? 
            (get amount milestone)
            tx-sender
            (unwrap! (get freelancer project) err-not-found)
        )))
        
        ;; Update milestone and funds
        (map-set milestones
            {project-id: project-id, milestone-id: milestone-id}
            (merge milestone {status: "completed"})
        )
        
        (map-set project-funds
            {project-id: project-id}
            {
                balance: (- (get balance funds) (get amount milestone)),
                released: (+ (get released funds) (get amount milestone))
            }
        )
        
        (ok true)
    )
)

(define-public (initiate-dispute (project-id uint) (reason (string-utf8 500)))
    (let
        (
            (project (unwrap! (map-get? projects {project-id: project-id}) err-not-found))
            (resolver-fee (/ (get total-amount project) u20)) ;; 5% fee
        )
        (asserts! (or 
            (is-eq tx-sender (get client project))
            (is-eq (some tx-sender) (get freelancer project))
        ) err-unauthorized)
        
        (map-set disputes
            {project-id: project-id}
            {
                initiated-by: tx-sender,
                reason: reason,
                resolver-fee: resolver-fee,
                resolved: false
            }
        )
        
        (map-set projects
            {project-id: project-id}
            (merge project {status: "disputed"})
        )
        
        (ok true)
    )
)

(define-public (resolve-dispute 
    (project-id uint) 
    (client-percentage uint)
    (freelancer-percentage uint))
    (let
        (
            (project (unwrap! (map-get? projects {project-id: project-id}) err-not-found))
            (funds (unwrap! (map-get? project-funds {project-id: project-id}) err-not-found))
            (dispute (unwrap! (map-get? disputes {project-id: project-id}) err-not-found))
        )
        (asserts! (is-eq tx-sender (get dispute-resolver project)) err-unauthorized)
        (asserts! (is-eq (+ client-percentage freelancer-percentage) u100) err-invalid-percentage)
        
        ;; Calculate amounts
        (let
            (
                (remaining-balance (get balance funds))
                (client-amount (/ (* remaining-balance client-percentage) u100))
                (freelancer-amount (/ (* remaining-balance freelancer-percentage) u100))
            )
            ;; Transfer funds
            (try! (as-contract (stx-transfer? client-amount tx-sender (get client project))))
            (try! (as-contract (stx-transfer? freelancer-amount tx-sender (unwrap! (get freelancer project) err-not-found))))
            (try! (as-contract (stx-transfer? (get resolver-fee dispute) tx-sender (get dispute-resolver project))))
            
            ;; Update project status
            (map-set projects
                {project-id: project-id}
                (merge project {status: "resolved"})
            )
            
            (map-set disputes
                {project-id: project-id}
                (merge dispute {resolved: true})
            )
            
            (ok true)
        )
    )
)

;; Initialize milestone
(define-public (set-milestone 
    (project-id uint) 
    (milestone-id uint)
    (amount uint)
    (description (string-utf8 256)))
    (let
        (
            (project (unwrap! (map-get? projects {project-id: project-id}) err-not-found))
        )
        (asserts! (is-eq tx-sender (get client project)) err-unauthorized)
        (asserts! (< milestone-id (get milestone-count project)) err-invalid-percentage)
        
        (map-set milestones
            {project-id: project-id, milestone-id: milestone-id}
            {
                amount: amount,
                description: description,
                status: "pending",
                completion-proof: none
            }
        )
        (ok true)
    )
)