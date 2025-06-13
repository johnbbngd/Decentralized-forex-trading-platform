;; Decentralized Forex Trading Platform
;; A DEX for trading tokenized foreign currencies with minimal slippage

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-BALANCE u101)
(define-constant ERR-INSUFFICIENT-LIQUIDITY u102)
(define-constant ERR-SLIPPAGE-TOO-HIGH u103)
(define-constant ERR-INVALID-AMOUNT u104)
(define-constant ERR-POOL-NOT-EXISTS u105)
(define-constant ERR-ZERO-AMOUNT u106)
(define-constant ERR-IDENTICAL-TOKENS u107)
(define-constant ERR-POOL-EXISTS u108)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant FEE-RATE u30) ;; 0.3% fee (30/10000)
(define-constant MIN-LIQUIDITY u1000)

;; Data structures
(define-map liquidity-pools 
  {token-a: principal, token-b: principal}
  {
    reserve-a: uint,
    reserve-b: uint,
    total-supply: uint,
    k-last: uint ;; for protocol fee calculation
  }
)

(define-map user-liquidity
  {user: principal, token-a: principal, token-b: principal}
  {shares: uint}
)

(define-map supported-currencies
  principal
  {
    name: (string-ascii 32),
    symbol: (string-ascii 8),
    decimals: uint,
    is-active: bool
  }
)

;; Price oracle data
(define-map price-feeds
  principal
  {
    price: uint, ;; price in USD with 8 decimals
    last-update: uint,
    is-valid: bool
  }
)

;; Trading stats
(define-map trading-stats
  {token-a: principal, token-b: principal}
  {
    volume-24h: uint,
    trades-count: uint,
    last-price: uint
  }
)

;; Admin functions
(define-public (add-supported-currency (token principal) (name (string-ascii 32)) (symbol (string-ascii 8)) (decimals uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) (err ERR-NOT-AUTHORIZED))
    (ok (map-set supported-currencies token 
      {name: name, symbol: symbol, decimals: decimals, is-active: true}))
  )
)

(define-public (update-price-feed (token principal) (price uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) (err ERR-NOT-AUTHORIZED))
    (ok (map-set price-feeds token 
      {price: price, last-update: stacks-block-height, is-valid: true}))
  )
)

;; Helper functions - non-recursive square root
(define-private (sqrt (n uint))
  (if (<= n u1)
    n
    (let ((x0 (/ (+ n u1) u2)))
      (let ((x1 (/ (+ x0 (/ n x0)) u2)))
        (let ((x2 (/ (+ x1 (/ n x1)) u2)))
          (let ((x3 (/ (+ x2 (/ n x2)) u2)))
            (let ((x4 (/ (+ x3 (/ n x3)) u2)))
              (let ((x5 (/ (+ x4 (/ n x4)) u2)))
                (let ((x6 (/ (+ x5 (/ n x5)) u2)))
                  (let ((x7 (/ (+ x6 (/ n x6)) u2)))
                    x7
                  )
                )
              )
            )
          )
        )
      )
    )
  )
)

(define-private (min-uint (a uint) (b uint))
  (if (<= a b) a b)
)

(define-private (get-token-pair (token-a principal) (token-b principal))
  (let (
    (hash-a (sha256 (unwrap-panic (to-consensus-buff? token-a))))
    (hash-b (sha256 (unwrap-panic (to-consensus-buff? token-b))))
  )
    (if (< hash-a hash-b)
      {token-a: token-a, token-b: token-b}
      {token-a: token-b, token-b: token-a}
    )
  )
)

(define-private (calculate-slippage (amount-in uint) (reserve-in uint) (reserve-out uint))
  (let (
    (amount-in-with-fee (* amount-in (- u10000 FEE-RATE)))
    (numerator (* amount-in-with-fee reserve-out))
    (denominator (+ (* reserve-in u10000) amount-in-with-fee))
    (amount-out (/ numerator denominator))
    (price-impact (/ (* amount-out u10000) reserve-out))
  )
    {amount-out: amount-out, price-impact: price-impact}
  )
)

;; Liquidity provision functions
(define-public (create-pool (token-a principal) (token-b principal) (amount-a uint) (amount-b uint))
  (let (
    (pair (get-token-pair token-a token-b))
    (sorted-token-a (get token-a pair))
    (sorted-token-b (get token-b pair))
    (sorted-amount-a (if (is-eq token-a sorted-token-a) amount-a amount-b))
    (sorted-amount-b (if (is-eq token-a sorted-token-a) amount-b amount-a))
    (liquidity (sqrt (* sorted-amount-a sorted-amount-b)))
  )
    (asserts! (not (is-eq token-a token-b)) (err ERR-IDENTICAL-TOKENS))
    (asserts! (and (> amount-a u0) (> amount-b u0)) (err ERR-ZERO-AMOUNT))
    (asserts! (is-none (map-get? liquidity-pools pair)) (err ERR-POOL-EXISTS))
    (asserts! (>= liquidity MIN-LIQUIDITY) (err ERR-INSUFFICIENT-LIQUIDITY))
    
    ;; Create pool
    (map-set liquidity-pools pair {
      reserve-a: sorted-amount-a,
      reserve-b: sorted-amount-b,
      total-supply: liquidity,
      k-last: (* sorted-amount-a sorted-amount-b)
    })
    
    ;; Mint LP tokens to user
    (map-set user-liquidity {user: tx-sender, token-a: sorted-token-a, token-b: sorted-token-b} 
      {shares: liquidity})
    
    (ok liquidity)
  )
)

(define-public (add-liquidity (token-a principal) (token-b principal) (amount-a-desired uint) 
                              (amount-b-desired uint) (amount-a-min uint) (amount-b-min uint))
  (let (
    (pair (get-token-pair token-a token-b))
    (sorted-token-a (get token-a pair))
    (sorted-token-b (get token-b pair))
    (pool (unwrap! (map-get? liquidity-pools pair) (err ERR-POOL-NOT-EXISTS)))
    (reserve-a (get reserve-a pool))
    (reserve-b (get reserve-b pool))
    (total-supply (get total-supply pool))
  )
    (let (
      (amount-b-optimal (/ (* amount-a-desired reserve-b) reserve-a))
      (amount-a-optimal (/ (* amount-b-desired reserve-a) reserve-b))
      (final-amounts 
        (if (<= amount-b-optimal amount-b-desired)
          {amount-a: amount-a-desired, amount-b: amount-b-optimal}
          {amount-a: amount-a-optimal, amount-b: amount-b-desired}
        )
      )
      (amount-a (get amount-a final-amounts))
      (amount-b (get amount-b final-amounts))
      (liquidity (min-uint (/ (* amount-a total-supply) reserve-a) 
                           (/ (* amount-b total-supply) reserve-b)))
    )
      (asserts! (and (>= amount-a amount-a-min) (>= amount-b amount-b-min)) (err ERR-SLIPPAGE-TOO-HIGH))
      (asserts! (> liquidity u0) (err ERR-INSUFFICIENT-LIQUIDITY))
      
      ;; Update pool reserves
      (map-set liquidity-pools pair {
        reserve-a: (+ reserve-a amount-a),
        reserve-b: (+ reserve-b amount-b),
        total-supply: (+ total-supply liquidity),
        k-last: (* (+ reserve-a amount-a) (+ reserve-b amount-b))
      })
      
      ;; Update user liquidity
      (let ((current-shares (default-to u0 (get shares (map-get? user-liquidity 
            {user: tx-sender, token-a: sorted-token-a, token-b: sorted-token-b})))))
        (map-set user-liquidity {user: tx-sender, token-a: sorted-token-a, token-b: sorted-token-b}
          {shares: (+ current-shares liquidity)})
      )
      
      (ok liquidity)
    )
  )
)

(define-public (remove-liquidity (token-a principal) (token-b principal) (liquidity uint) 
                                (amount-a-min uint) (amount-b-min uint))
  (let (
    (pair (get-token-pair token-a token-b))
    (sorted-token-a (get token-a pair))
    (sorted-token-b (get token-b pair))
    (pool (unwrap! (map-get? liquidity-pools pair) (err ERR-POOL-NOT-EXISTS)))
    (user-lp (unwrap! (map-get? user-liquidity 
                      {user: tx-sender, token-a: sorted-token-a, token-b: sorted-token-b}) 
                      (err ERR-INSUFFICIENT-BALANCE)))
    (user-shares (get shares user-lp))
    (total-supply (get total-supply pool))
    (reserve-a (get reserve-a pool))
    (reserve-b (get reserve-b pool))
    (amount-a (/ (* liquidity reserve-a) total-supply))
    (amount-b (/ (* liquidity reserve-b) total-supply))
  )
    (asserts! (>= user-shares liquidity) (err ERR-INSUFFICIENT-BALANCE))
    (asserts! (and (>= amount-a amount-a-min) (>= amount-b amount-b-min)) (err ERR-SLIPPAGE-TOO-HIGH))
    
    ;; Update user shares
    (if (is-eq user-shares liquidity)
      (map-delete user-liquidity {user: tx-sender, token-a: sorted-token-a, token-b: sorted-token-b})
      (map-set user-liquidity {user: tx-sender, token-a: sorted-token-a, token-b: sorted-token-b}
        {shares: (- user-shares liquidity)})
    )
    
    ;; Update pool
    (map-set liquidity-pools pair {
      reserve-a: (- reserve-a amount-a),
      reserve-b: (- reserve-b amount-b),
      total-supply: (- total-supply liquidity),
      k-last: (* (- reserve-a amount-a) (- reserve-b amount-b))
    })
    
    (ok {amount-a: amount-a, amount-b: amount-b})
  )
)

;; Trading functions
(define-public (swap-exact-tokens-for-tokens (amount-in uint) (amount-out-min uint) 
                                           (token-in principal) (token-out principal))
  (let (
    (pair (get-token-pair token-in token-out))
    (pool (unwrap! (map-get? liquidity-pools pair) (err ERR-POOL-NOT-EXISTS)))
    (is-token-a-in (is-eq token-in (get token-a pair)))
    (reserve-in (if is-token-a-in (get reserve-a pool) (get reserve-b pool)))
    (reserve-out (if is-token-a-in (get reserve-b pool) (get reserve-a pool)))
    (slippage-calc (calculate-slippage amount-in reserve-in reserve-out))
    (amount-out (get amount-out slippage-calc))
  )
    (asserts! (> amount-in u0) (err ERR-ZERO-AMOUNT))
    (asserts! (>= amount-out amount-out-min) (err ERR-SLIPPAGE-TOO-HIGH))
    (asserts! (> amount-out u0) (err ERR-INSUFFICIENT-LIQUIDITY))
    
    ;; Update reserves
    (let (
      (new-reserve-in (+ reserve-in amount-in))
      (new-reserve-out (- reserve-out amount-out))
    )
      (map-set liquidity-pools pair {
        reserve-a: (if is-token-a-in new-reserve-in new-reserve-out),
        reserve-b: (if is-token-a-in new-reserve-out new-reserve-in),
        total-supply: (get total-supply pool),
        k-last: (* new-reserve-in new-reserve-out)
      })
    )
    
    ;; Update trading stats
    (let ((current-stats (default-to {volume-24h: u0, trades-count: u0, last-price: u0}
                                   (map-get? trading-stats pair))))
      (map-set trading-stats pair {
        volume-24h: (+ (get volume-24h current-stats) amount-in),
        trades-count: (+ (get trades-count current-stats) u1),
        last-price: (/ (* amount-out u100000000) amount-in) ;; 8 decimal places
      })
    )
    
    (ok amount-out)
  )
)

(define-public (swap-tokens-for-exact-tokens (amount-out uint) (amount-in-max uint)
                                           (token-in principal) (token-out principal))
  (let (
    (pair (get-token-pair token-in token-out))
    (pool (unwrap! (map-get? liquidity-pools pair) (err ERR-POOL-NOT-EXISTS)))
    (is-token-a-in (is-eq token-in (get token-a pair)))
    (reserve-in (if is-token-a-in (get reserve-a pool) (get reserve-b pool)))
    (reserve-out (if is-token-a-in (get reserve-b pool) (get reserve-a pool)))
    ;; Calculate required input for exact output
    (numerator (* reserve-in amount-out u10000))
    (denominator (* (- reserve-out amount-out) (- u10000 FEE-RATE)))
    (amount-in (+ (/ numerator denominator) u1)) ;; Add 1 for rounding
  )
    (asserts! (> amount-out u0) (err ERR-ZERO-AMOUNT))
    (asserts! (< amount-out reserve-out) (err ERR-INSUFFICIENT-LIQUIDITY))
    (asserts! (<= amount-in amount-in-max) (err ERR-SLIPPAGE-TOO-HIGH))
    
    ;; Update reserves
    (let (
      (new-reserve-in (+ reserve-in amount-in))
      (new-reserve-out (- reserve-out amount-out))
    )
      (map-set liquidity-pools pair {
        reserve-a: (if is-token-a-in new-reserve-in new-reserve-out),
        reserve-b: (if is-token-a-in new-reserve-out new-reserve-in),
        total-supply: (get total-supply pool),
        k-last: (* new-reserve-in new-reserve-out)
      })
    )
    
    (ok amount-in)
  )
)

;; Read-only functions
(define-read-only (get-pool-info (token-a principal) (token-b principal))
  (let ((pair (get-token-pair token-a token-b)))
    (map-get? liquidity-pools pair)
  )
)

(define-read-only (get-user-liquidity (user principal) (token-a principal) (token-b principal))
  (let ((pair (get-token-pair token-a token-b)))
    (map-get? user-liquidity {user: user, token-a: (get token-a pair), token-b: (get token-b pair)})
  )
)

(define-read-only (get-amount-out (amount-in uint) (token-in principal) (token-out principal))
  (let (
    (pair (get-token-pair token-in token-out))
    (pool (unwrap-panic (map-get? liquidity-pools pair)))
    (is-token-a-in (is-eq token-in (get token-a pair)))
    (reserve-in (if is-token-a-in (get reserve-a pool) (get reserve-b pool)))
    (reserve-out (if is-token-a-in (get reserve-b pool) (get reserve-a pool)))
  )
    (get amount-out (calculate-slippage amount-in reserve-in reserve-out))
  )
)

(define-read-only (get-amount-in (amount-out uint) (token-in principal) (token-out principal))
  (let (
    (pair (get-token-pair token-in token-out))
    (pool (unwrap-panic (map-get? liquidity-pools pair)))
    (is-token-a-in (is-eq token-in (get token-a pair)))
    (reserve-in (if is-token-a-in (get reserve-a pool) (get reserve-b pool)))
    (reserve-out (if is-token-a-in (get reserve-b pool) (get reserve-a pool)))
    (numerator (* reserve-in amount-out u10000))
    (denominator (* (- reserve-out amount-out) (- u10000 FEE-RATE)))
  )
    (+ (/ numerator denominator) u1)
  )
)

(define-read-only (get-trading-stats (token-a principal) (token-b principal))
  (let ((pair (get-token-pair token-a token-b)))
    (map-get? trading-stats pair)
  )
)

(define-read-only (get-price-feed (token principal))
  (map-get? price-feeds token)
)

(define-read-only (is-supported-currency (token principal))
  (is-some (map-get? supported-currencies token))
)