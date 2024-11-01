import { Command } from "commander"
import chalk, { Chalk } from "chalk";
import readline from "readline";
import { copyTrade } from "../scripts/copy-trade";
import { monitorSnipe } from "../scripts/monitor-sniper";
import { sell } from "../scripts/sell";
import { webhookMonitor } from "../scripts/webhook-monitor";
import { buy } from "../scripts/buy";
import { commentBomb } from "../scripts/comment-bomb";
import { tradeHistory } from "../scripts/trade-history";
import { myCoins } from "../scripts/my-coins";

export function generateTitle(title: string, color: string) {

    clearConsole()
    const asciiArt = `
    ██████╗ ██╗   ██╗███╗   ███╗██████╗ ██╗  ██╗
    ██╔══██╗██║   ██║████╗ ████║██╔══██╗╚██╗██╔╝
    ██████╔╝██║   ██║██╔████╔██║██████╔╝ ╚███╔╝ 
    ██╔═══╝ ██║   ██║██║╚██╔╝██║██╔═══╝  ██╔██╗ 
    ██║     ╚██████╔╝██║ ╚═╝ ██║██║     ██╔╝ ██╗
    ╚═╝      ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚═╝  ╚═╝
`

    const titleASCII = (chalk as any)[color](asciiArt) + '\n\n' + (chalk as any).bold[color](title);
    console.log(titleASCII.substring(0, titleASCII.length - 15));
}

export function clearConsole() {
    //const blank = '\n'.repeat(process.stdout.rows);
    //console.log(blank);
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
}



export function displayMenu(menuItems: string[], selectedItemIndex: number) {
    clearConsole();
    generateTitle('PUMPX', 'blueBright');
    console.log(chalk.blue.bold('Use ↑ and ↓ arrow keys to navigate, Enter to select.'));
    console.log(chalk.blue.bold('Press h while hovering on option for more info.\n'));
    console.log(chalk.blueBright.bold('Menu:'));
    menuItems.forEach((item, index) => {
        if (index === selectedItemIndex) {
            console.log(`${chalk.blue.bold('->')} ${item == 'Exit' ? (chalk.red.bold(item)) : (chalk.whiteBright.bold(item))}`);
        } else {
            console.log(`   ${item == 'Exit' ? (chalk.redBright(item)) : (chalk.grey.bold(item))}`);
        }
    });
}




export async function handleInput(menuItems: string[], selectedItemIndex: number) {
    displayMenu(menuItems, selectedItemIndex);
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    let OptionChoosen: boolean = false;

    process.stdin.on('keypress', async (str, key) => {

        if (OptionChoosen) { return }

        if (key && key.name === 'up') {
            selectedItemIndex = Math.max(selectedItemIndex - 1, 0);
            displayMenu(menuItems, selectedItemIndex);
        } else if (key && key.name === 'down') {
            selectedItemIndex = Math.min(selectedItemIndex + 1, menuItems.length - 1);
            displayMenu(menuItems, selectedItemIndex);
        } else if (key && key.name === 'return') {
            clearConsole();
            process.stdin.setRawMode(false);
            process.stdin.pause()
            if (menuItems[selectedItemIndex] != 'Exit') {
                OptionChoosen = true;
                console.log(chalk.blueBright(`-> ${menuItems[selectedItemIndex]}`));
                if (menuItems[selectedItemIndex] === 'Copy Trade') {
                    await copyTrade();
                    displayMenu(menuItems, selectedItemIndex);
                } else if (menuItems[selectedItemIndex] === 'Sniper') {
                    await monitorSnipe();
                    displayMenu(menuItems, selectedItemIndex);
                } else if (menuItems[selectedItemIndex] === 'Buy') {
                    await buy();
                    displayMenu(menuItems, selectedItemIndex);
                } else if (menuItems[selectedItemIndex] === 'Sell') {
                    await sell();
                    displayMenu(menuItems, selectedItemIndex);
                } else if (menuItems[selectedItemIndex] === 'New Coins Monitor') {
                    await webhookMonitor();
                    displayMenu(menuItems, selectedItemIndex);
                } else if (menuItems[selectedItemIndex] === 'Comment Bomb') {
                    await commentBomb();
                    displayMenu(menuItems, selectedItemIndex);
                } else if (menuItems[selectedItemIndex] === 'Volume Bot (soon)') {
                    displayMenu(menuItems, selectedItemIndex);
                } else if (menuItems[selectedItemIndex] === 'My Coins') {
                    await myCoins();
                    displayMenu(menuItems, selectedItemIndex);
                } else if (menuItems[selectedItemIndex] === 'Trade History') {
                    await tradeHistory()
                    displayMenu(menuItems, selectedItemIndex);
                }
            } else {
                process.exit(0);
            }
            process.stdin.setRawMode(true);
            process.stdin.resume();
            OptionChoosen = false;
        }
    });

    process.on('SIGINT', () => {
        clearConsole();
        process.exit();
    });
}

