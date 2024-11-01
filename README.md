# NeoXPF
AI Agent Integration to the Solana Blockchain working with Memo Commands

# Twitter Solana AI Bot

This bot is a Solana and Twitter-integrated AI tool that enables interaction through Solana transactions with embedded commands. The bot generates its own Solana wallet and responds to commands sent via Solana transactions with specific memos. These commands allow the AI to perform actions such as posting tweets, using images, and linking to external resources.

## Features

- **Automated Solana Wallet Creation**: The bot creates a unique Solana wallet address for each instance.
- **Transaction-Based Commands**: Actions are triggered via Solana transactions containing memos with specific commands.
- **Twitter API Integration**: The bot can post tweets, images, and links based on the transaction commands it receives.
- **Solana CLI Support**: The bot is built to interact with Solana using the Solana CLI, enabling seamless transaction handling and wallet management.

## Command Format

Commands are formatted as a single memo string within a Solana transaction. The command structure follows this format:

```
launch:ticker:imageurl:linkurl:devamount1
```

### Command Parameters

- **launch**: Initiates the action specified in the command.
- **ticker**: Represents a stock or token ticker symbol to fetch or track.
- **imageurl**: The URL of an image to be attached to a Twitter post.
- **linkurl**: A hyperlink to include in the tweet for additional information.
- **devamount1**: A developer-defined amount or variable, which can be customized per use case.

### Example Command

```plaintext
launch:BTC:https://example.com/image.jpg:https://example.com:500
```

This command tells the AI to:
- Track or post about the ticker symbol `BTC`.
- Use the image from `https://example.com/image.jpg`.
- Include a link to `https://example.com`.
- Set the developer amount to `500`.

## Getting Started

### Prerequisites

- **Node.js**: Make sure Node.js is installed for running JavaScript-based scripts.
- **Twitter Developer Account**: You need access to Twitter API credentials.
- **Solana CLI**: Install the Solana CLI to manage Solana wallets and transactions.

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/NeoXAIT/NeoXPF.git
   cd run
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Twitter API keys**:
   Create a `.env` file in the root directory and add your Twitter API keys:
   ```plaintext
   TWITTER_API_KEY=your_api_key
   TWITTER_API_SECRET=your_api_secret
   ACCESS_TOKEN=your_access_token
   ACCESS_TOKEN_SECRET=your_access_token_secret
   ```

4. **Initialize Solana Wallet**:
   Ensure that the Solana CLI is installed and set up. Run the following command to create a new wallet:
   ```bash
   solana-keygen new --outfile ~/.config/solana/id.json
   ```

### Usage

1. **Start the Bot**:
   Run the bot to begin monitoring for Solana transactions with commands:
   ```bash
   node index.js
   ```

2. **Send a Transaction with a Command**:
   Using the Solana CLI, you can send a transaction with the command memo:
   ```bash
   solana transfer <bot_wallet_address> <amount> --allow-unfunded-recipient --memo "launch:BTC:https://example.com/image.jpg:https://example.com:500"
   ```

3. **AI Response**:
   - The bot monitors incoming transactions and extracts commands from the memo.
   - Once a command is parsed, it executes the requested action, such as posting a tweet with the specified image, link, and ticker.

## Development and Customization

- **Customize Commands**: You can modify the `index.js` file to expand the bot’s functionality or add new command types.
- **Solana Wallet Management**: Use the Solana CLI for advanced wallet operations or to manage multiple wallets for testing purposes.

## Contributing

Feel free to fork the repository and submit pull requests. Contributions are welcome to expand functionality, improve code quality, or add new features.

## License

This project is licensed under the MIT License.

---

## Notes

This bot is intended for educational and experimental purposes. Please use responsibly and be mindful of Twitter’s API rate limits and Solana transaction costs.
