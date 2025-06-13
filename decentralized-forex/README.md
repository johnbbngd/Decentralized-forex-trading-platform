# Decentralized Forex Trading Platform (DEX)

A decentralized exchange (DEX) built on Stacks blockchain for trading tokenized foreign currencies with minimal slippage. This smart contract implements an Automated Market Maker (AMM) model similar to Uniswap V2, specifically designed for forex trading pairs with built-in price oracles and trading analytics.

## Features

- **Automated Market Maker (AMM)**: Constant product formula (x * y = k) for price discovery
- **Liquidity Pools**: Create and manage liquidity pools for currency pairs
- **Low Slippage Trading**: Optimized for minimal price impact on trades
- **Price Oracles**: Built-in price feed system for accurate currency valuations
- **Trading Analytics**: Real-time volume and trading statistics
- **Fee Structure**: 0.3% trading fee distributed to liquidity providers
- **Multi-Currency Support**: Extensible system for adding new tokenized currencies

## Architecture

### Core Components

1. **Liquidity Pools**: Manage reserves and liquidity for trading pairs
2. **Trading Engine**: Execute swaps with slippage protection
3. **Price Oracle**: External price feed integration
4. **Analytics**: Track trading volume and statistics
5. **Admin Controls**: Currency management and price updates

### Key Constants

- **Fee Rate**: 0.3% (30/10000)
- **Minimum Liquidity**: 1000 units
- **Price Precision**: 8 decimal places

## Smart Contract Functions

### Admin Functions

#### `add-supported-currency`
```clarity
(add-supported-currency token name symbol decimals)
```
Add a new tokenized currency to the platform.

**Parameters:**
- `token`: Principal address of the token contract
- `name`: Currency name (max 32 characters)
- `symbol`: Currency symbol (max 8 characters)
- `decimals`: Number of decimal places

#### `update-price-feed`
```clarity
(update-price-feed token price)
```
Update the USD price for a specific currency.

**Parameters:**
- `token`: Token principal
- `price`: USD price with 8 decimal precision

### Liquidity Management

#### `create-pool`
```clarity
(create-pool token-a token-b amount-a amount-b)
```
Create a new liquidity pool for a currency pair.

**Parameters:**
- `token-a`, `token-b`: Token principals for the trading pair
- `amount-a`, `amount-b`: Initial liquidity amounts

**Returns:** Initial liquidity tokens minted

#### `add-liquidity`
```clarity
(add-liquidity token-a token-b amount-a-desired amount-b-desired amount-a-min amount-b-min)
```
Add liquidity to an existing pool with slippage protection.

**Parameters:**
- `amount-a-desired`, `amount-b-desired`: Desired liquidity amounts
- `amount-a-min`, `amount-b-min`: Minimum acceptable amounts (slippage protection)

#### `remove-liquidity`
```clarity
(remove-liquidity token-a token-b liquidity amount-a-min amount-b-min)
```
Remove liquidity from a pool and receive underlying tokens.

**Parameters:**
- `liquidity`: Amount of liquidity tokens to burn
- `amount-a-min`, `amount-b-min`: Minimum token amounts to receive

### Trading Functions

#### `swap-exact-tokens-for-tokens`
```clarity
(swap-exact-tokens-for-tokens amount-in amount-out-min token-in token-out)
```
Swap an exact amount of input tokens for output tokens.

**Parameters:**
- `amount-in`: Exact input amount
- `amount-out-min`: Minimum output amount (slippage protection)
- `token-in`, `token-out`: Input and output token principals

#### `swap-tokens-for-exact-tokens`
```clarity
(swap-tokens-for-exact-tokens amount-out amount-in-max token-in token-out)
```
Swap tokens to receive an exact amount of output tokens.

**Parameters:**
- `amount-out`: Exact output amount desired
- `amount-in-max`: Maximum input amount willing to pay

### Read-Only Functions

#### `get-pool-info`
```clarity
(get-pool-info token-a token-b)
```
Get detailed information about a liquidity pool.

**Returns:**
- `reserve-a`, `reserve-b`: Current reserves
- `total-supply`: Total liquidity tokens
- `k-last`: Last recorded k value

#### `get-amount-out`
```clarity
(get-amount-out amount-in token-in token-out)
```
Calculate output amount for a given input (including fees and slippage).

#### `get-trading-stats`
```clarity
(get-trading-stats token-a token-b)
```
Get 24-hour trading statistics for a pair.

**Returns:**
- `volume-24h`: 24-hour trading volume
- `trades-count`: Number of trades
- `last-price`: Last recorded price

## Usage Examples

### Creating a New Currency Pool

```clarity
;; Add EUR token support
(add-supported-currency 'SP123...EUR "Euro" "EUR" u8)

;; Create EUR/USD pool with initial liquidity
(create-pool 'SP123...EUR 'SP456...USD u100000000 u120000000)
```

### Adding Liquidity

```clarity
;; Add liquidity to EUR/USD pool
(add-liquidity 
  'SP123...EUR 
  'SP456...USD 
  u50000000  ;; 50 EUR desired
  u60000000  ;; 60 USD desired
  u49000000  ;; 49 EUR minimum
  u58000000  ;; 58 USD minimum
)
```

### Trading Currencies

```clarity
;; Swap exactly 100 USD for EUR (minimum 82 EUR)
(swap-exact-tokens-for-tokens 
  u100000000  ;; 100 USD
  u82000000   ;; minimum 82 EUR
  'SP456...USD 
  'SP123...EUR
)
```

### Checking Pool Information

```clarity
;; Get EUR/USD pool details
(get-pool-info 'SP123...EUR 'SP456...USD)

;; Calculate expected output for 50 USD input
(get-amount-out u50000000 'SP456...USD 'SP123...EUR)
```

## Error Codes

| Code | Constant | Description |
|------|----------|-------------|
| 100 | ERR-NOT-AUTHORIZED | Caller not authorized for admin functions |
| 101 | ERR-INSUFFICIENT-BALANCE | User has insufficient token balance |
| 102 | ERR-INSUFFICIENT-LIQUIDITY | Pool has insufficient liquidity |
| 103 | ERR-SLIPPAGE-TOO-HIGH | Trade exceeds slippage tolerance |
| 104 | ERR-INVALID-AMOUNT | Invalid amount provided |
| 105 | ERR-POOL-NOT-EXISTS | Trading pool doesn't exist |
| 106 | ERR-ZERO-AMOUNT | Zero amount not allowed |
| 107 | ERR-IDENTICAL-TOKENS | Cannot create pool with identical tokens |
| 108 | ERR-POOL-EXISTS | Pool already exists |

## Security Considerations

### Slippage Protection
All trading and liquidity functions include slippage protection through minimum/maximum amount parameters.

### Price Oracle Security
- Price feeds require admin authorization
- Timestamps track price update freshness
- Validity flags prevent stale price usage

### Liquidity Security
- Minimum liquidity requirements prevent dust attacks
- K-value tracking ensures constant product maintenance
- LP token accounting prevents unauthorized withdrawals

## Development Setup

### Prerequisites
- Stacks blockchain development environment
- Clarity CLI tools
- Testnet STX for contract deployment

### Deployment Steps

1. **Deploy Contract**
   ```bash
   clarinet deploy --testnet
   ```

2. **Initialize Supported Currencies**
   ```clarity
   ;; Add major currency pairs
   (add-supported-currency 'SP...USD "US Dollar" "USD" u8)
   (add-supported-currency 'SP...EUR "Euro" "EUR" u8)
   (add-supported-currency 'SP...GBP "British Pound" "GBP" u8)
   ```

3. **Set Initial Price Feeds**
   ```clarity
   (update-price-feed 'SP...EUR u118500000)  ;; 1.185 USD per EUR
   (update-price-feed 'SP...GBP u127300000)  ;; 1.273 USD per GBP
   ```

## API Integration

### Frontend Integration
The contract provides comprehensive read-only functions for building trading interfaces:

- Pool information and reserves
- Price calculations and slippage estimates
- Trading statistics and analytics
- User liquidity positions

### Price Oracle Integration
External price feeds can be integrated through the `update-price-feed` function, supporting:
- Real-time forex rates
- Multiple price sources
- Automated price updates

## Roadmap

### Phase 1 - Core Features ✅
- Basic AMM functionality
- Liquidity pool management
- Trading with slippage protection

### Phase 2 - Advanced Features
- Flash loans
- Limit orders
- Advanced analytics dashboard

### Phase 3 - Scaling
- Layer 2 integration
- Cross-chain bridges
- Institutional features

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit a pull request

## License

This project is licensed under the MIT License. See LICENSE file for details.

## Disclaimer

This is experimental DeFi software. Use at your own risk. Always verify contract code and test with small amounts before significant usage.