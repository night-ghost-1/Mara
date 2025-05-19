import { Player, Settlement } from "library/game-logic/horde-types";
import { MasterMind } from "library/mastermind/mastermind-types";

export class MaraSettlementData {
    public Settlement: Settlement;
    public MasterMind: MasterMind;
    public Player: Player;

    constructor(settlement: Settlement, masterMind: MasterMind, player: Player) {
        this.Settlement = settlement;
        this.MasterMind = masterMind;
        this.Player = player;
    }
}
