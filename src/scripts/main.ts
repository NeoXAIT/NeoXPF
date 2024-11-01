import dotenv from "dotenv";
import { handleInput} from "../utils/cli";
dotenv.config();
process.removeAllListeners('warning');
async function main() {

    const menuItems: string[] = [
        'Sniper',
        'Copy Trade',
        'Buy',
        'Sell',
        'Comment Bomb',
        'Volume Bot (soon)',
        'New Coins Monitor',
        'My Coins',
        'Trade History',
        'Exit',
    ];
    handleInput(menuItems, 0);

}

main()