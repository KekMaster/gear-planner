import {CharacterGearSet} from "@xivgear/core/gear";
import {STAT_ABBREVIATIONS, STAT_DISPLAY_ORDER} from "@xivgear/xivmath/xivconstants";
import {RawStatKey} from "@xivgear/xivmath/geartypes";
import {
    critDmg,
    detDmg,
    dhitChance,
    mainStatMulti,
    mpTick,
    sksTickMulti,
    sksToGcd,
    spsTickMulti,
    spsToGcd,
    tenacityDmg,
    tenacityIncomingDmg,
    vitToHp
} from "@xivgear/xivmath/xivmath";
import {GearPlanSheet} from "@xivgear/core/sheet";
import {closeModal, getModal, setModal} from "@xivgear/common-ui/modalcontrol";

interface Tiering {
    lower: number,
    upper: number
}

interface TieringOffset {
    offset: number,
    label: string,
}

interface TieringDisplay {
    label: string,
    fullName: string,
    description: string,
    tieringFunc: (offset: number) => Tiering,
    extraOffsets: TieringOffset[]
}

export class SingleStatTierDisplay extends HTMLDivElement {
    private readonly lowerLeftDiv: HTMLDivElement;
    private readonly lowerRightDiv: HTMLDivElement;
    private readonly upperDiv: HTMLDivElement;
    private readonly expansionDiv: HTMLDivElement;
    private _expanded: boolean;

    constructor(private stat: RawStatKey) {
        super();
        // Upper area - name of stat/derived value
        this.classList.add('single-stat-tier-display');
        this.classList.add('stat-' + stat);
        this.upperDiv = document.createElement('div');
        this.upperDiv.classList.add('single-stat-tier-display-upper');
        this.appendChild(this.upperDiv);

        this.lowerLeftDiv = document.createElement('div');
        // Lower bound
        this.lowerLeftDiv.classList.add('single-stat-tier-display-lower-left');
        this.appendChild(this.lowerLeftDiv);
        // Upper bound
        this.lowerRightDiv = document.createElement('div');
        this.lowerRightDiv.classList.add('single-stat-tier-display-lower-right');
        this.appendChild(this.lowerRightDiv);

        this.expansionDiv = document.createElement('div');
        this.expansionDiv.classList.add('single-stat-tier-display-expansion');
        this.expansionDiv.textContent = "Foo bar";
        this.appendChild(this.expansionDiv);

        this.expanded = false;
    }

    refresh(tiering: TieringDisplay): void {
        this.upperDiv.textContent = tiering.label;
        this.upperDiv.title = `${tiering.label}: ${tiering.description}`;
        {
            const baseTiering = tiering.tieringFunc(0);
            if (baseTiering.lower > 0) {
                this.lowerLeftDiv.textContent = '-' + baseTiering.lower;
                this.classList.remove('stat-tiering-perfect');
                this.lowerLeftDiv.title = `Your ${tiering.fullName} is ${baseTiering.lower} above the next-lowest tier.\nIn other words, you could lose up to ${baseTiering.lower} points without negatively impacting your ${tiering.fullName}.`;
            }
            else {
                this.lowerLeftDiv.textContent = '✔';
                this.lowerLeftDiv.title = `Your ${tiering.fullName} is perfectly tiered.\nIf you lose any ${this.stat}, it will negatively impact your ${tiering.fullName}.`;
                this.classList.add('stat-tiering-perfect');
            }
            this.lowerRightDiv.textContent = '+' + baseTiering.upper;
            this.lowerRightDiv.title = `You must gain ${baseTiering.upper} points of ${this.stat} in order to increase your ${tiering.fullName}.`;
        }

        this.expansionDiv.replaceChildren(...tiering.extraOffsets.map((extraOffset) => {
            const tieringResult = tiering.tieringFunc(extraOffset.offset);

            const div = document.createElement('div');
            div.classList.add('single-stat-tier-display-expansion-item');
            const upperDiv = document.createElement('div');
            upperDiv.textContent = extraOffset.label;
            const lowerLeftDiv = document.createElement('div');
            lowerLeftDiv.textContent
            const lowerRightDiv = document.createElement('div');

            upperDiv.classList.add('single-stat-tier-display-upper');
            lowerLeftDiv.classList.add('single-stat-tier-display-lower-left');
            lowerRightDiv.classList.add('single-stat-tier-display-lower-right');

            if (tieringResult.lower > 0) {
                lowerLeftDiv.textContent = '-' + tieringResult.lower;
                div.classList.remove('stat-tiering-perfect');
                this.lowerLeftDiv.title = `Your ${tiering.fullName} is ${tieringResult.lower} above the next-lowest tier.\nIn other words, you could lose up to ${tieringResult.lower} points without negatively impacting your ${tiering.fullName}.`;
            }
            else {
                lowerLeftDiv.textContent = '✔';
                lowerLeftDiv.title = `Your ${tiering.fullName} is perfectly tiered.\nIf you lose any ${this.stat}, it will negatively impact your ${tiering.fullName}.`;
                div.classList.add('stat-tiering-perfect');
            }
            lowerRightDiv.textContent = '+' + tieringResult.upper;
            lowerRightDiv.title = `You must gain ${tieringResult.upper} points of ${this.stat} in order to increase your ${tiering.fullName}.`;

            div.replaceChildren(upperDiv, lowerLeftDiv, lowerRightDiv);
            return div;
        }));
    }

    get expanded(): boolean {
        return this._expanded;
    }

    set expanded(value: boolean) {
        this._expanded = value;
        this.expansionDiv.style.display = value ? '' : 'none';
    }
}

export class StatTierDisplay extends HTMLDivElement {
    private readonly eleMap = new Map<string, SingleStatTierDisplay>();

    constructor(private sheet: GearPlanSheet) {
        super();
        this.classList.add('stat-tier-display');
    }

    private expanded: boolean = false;


    toggleState(external: boolean = false) {
        if (this.expanded) {
            if (!external) {
                if (getModal()?.element === this) {
                    closeModal();
                }
            }
            this.expanded = false;
        }
        else {
            this.expanded = true;
            const outer = this;
            setModal({
                close() {
                    outer.toggleState(true);
                },
                element: this,
            })
        }
        for (const value of this.eleMap.values()) {
            value.expanded = this.expanded;
        }
    }

    refresh(gearSet: CharacterGearSet) {
        let relevantStats = STAT_DISPLAY_ORDER.filter(stat => this.sheet.isStatRelevant(stat));
        if (this.sheet.ilvlSync && !relevantStats.includes('vitality')) {
            relevantStats = ['vitality', ...relevantStats];
        }
        for (const stat of relevantStats) {
            try {
                const statTiering = this.getStatTiering(stat, gearSet);
                for (const tieringDisplay of statTiering) {
                    const key = tieringDisplay.label;
                    let singleStatTierDisplay: SingleStatTierDisplay;
                    if (this.eleMap.has(key)) {
                        singleStatTierDisplay = this.eleMap.get(key);
                    }
                    else {
                        singleStatTierDisplay = new SingleStatTierDisplay(stat);
                        this.eleMap.set(key, singleStatTierDisplay);
                        this.appendChild(singleStatTierDisplay);
                        singleStatTierDisplay.addEventListener('click', () => this.toggleState());
                    }
                    singleStatTierDisplay.refresh(tieringDisplay);
                    // const tierDisplayNode = document.createElement('div');
                    // this.textContent += `${tieringDisplay.label}: -${tieringDisplay.tiering.lower} +${tieringDisplay.tiering.upper}; `;
                }
            }
            catch (e) {
                console.error("Error computing stat tiering", e);
            }
        }
    }


    private getStatTiering(stat: RawStatKey, set: CharacterGearSet): TieringDisplay[] {
        const computed = set.computedStats;
        const levelStats = computed.levelStats;
        const jobStats = computed.jobStats;
        const curVal = computed[stat];
        const abbrev = STAT_ABBREVIATIONS[stat];
        const gcdOver = jobStats.gcdDisplayOverrides?.(this.sheet.level);
        const makeTiering = (rawFormula: ((value: number) => number)) => {
            return (offset: number) => this.getCombinedTiering(curVal + offset, rawFormula);
        };
        const relevantMateria = set.sheet.relevantMateria
            .filter(materia => materia.primaryStat === stat)
            .sort((a, b) => (b.primaryStatValue - a.primaryStatValue));
        let extraOffsets: TieringOffset[];

        if (relevantMateria.length === 0) {
            extraOffsets = [];
        }
        else {
            const materia = relevantMateria[0];
            const materiaValue = materia.primaryStatValue;
            const multipliers = [3, 2, 1, -1, -2, -3];
            extraOffsets = multipliers.map(multiplier => multiplier * materiaValue)
                .map(value => ({
                    offset: value,
                    // Format as +5, +0, -5, etc
                    label: value < 0 ? value.toString() : '+' + value.toString(),
                }));
        }

        switch (stat) {
            case "strength":
            case "dexterity":
            case "intelligence":
            case "mind":
                return [{
                    label: abbrev,
                    fullName: stat + ' multiplier',
                    description: 'Damage multiplier from primary stat',
                    tieringFunc: makeTiering(value => mainStatMulti(levelStats, jobStats, value)),
                    extraOffsets: extraOffsets
                }];
            case "vitality":
                return [{
                    label: abbrev,
                    fullName: 'Hit Points',
                    description: 'Hit Points (affected by Vitality)',
                    tieringFunc: makeTiering(value => vitToHp(levelStats, jobStats, value)),
                    extraOffsets: extraOffsets
                }];
            case "determination":
                return [{
                    label: abbrev,
                    fullName: stat + ' multiplier',
                    description: 'Damage multiplier from Determination',
                    tieringFunc: makeTiering(value => detDmg(levelStats, value)),
                    extraOffsets: extraOffsets,
                }];
            case "piety":
                return [{
                    label: abbrev,
                    fullName: 'MP Regen',
                    description: 'MP Regen (affected by Piety)',
                    tieringFunc: makeTiering(value => mpTick(levelStats, value)),
                    extraOffsets: extraOffsets
                }];
            case "crit":
                return [{
                    label: abbrev,
                    fullName: 'critical hit',
                    description: 'Critical hit (chance and multiplier)',
                    tieringFunc: makeTiering(value => critDmg(levelStats, value)),
                    extraOffsets: extraOffsets,
                }];
            case "dhit":
                return [{
                    label: abbrev,
                    fullName: 'direct hit change',
                    description: 'Change to land a direct hit',
                    tieringFunc: makeTiering(value => dhitChance(levelStats, value)),
                    extraOffsets: extraOffsets,
                }];
            case "spellspeed": {
                const tierDisplays: TieringDisplay[] = [];
                if (gcdOver) {
                    gcdOver.filter(over => over.basis === 'sps')
                        .forEach(over => {
                            tierDisplays.push({
                                label: over.shortLabel,
                                fullName: over.longLabel,
                                description: over.description,
                                tieringFunc: makeTiering(value => {
                                    const haste = computed.haste(over.attackType) + over.haste;
                                    return spsToGcd(over.gcdTime, levelStats, value, haste);
                                }),
                                extraOffsets: extraOffsets
                            })
                        })
                }
                else {
                    tierDisplays.push({
                        label: abbrev + ' GCD',
                        fullName: 'GCD for spells',
                        description: 'Global cooldown (recast) time for spells',
                        tieringFunc: makeTiering(value => {
                            const haste = computed.haste('Spell');
                            return spsToGcd(2.5, levelStats, value, haste);
                        }),
                        extraOffsets: extraOffsets
                    });
                }
                return [...tierDisplays, {
                    label: abbrev + ' DoT',
                    fullName: 'DoT scalar for spells',
                    description: 'DoT damage multiplier for spells',
                    tieringFunc: makeTiering(value => spsTickMulti(levelStats, value)),
                    extraOffsets: extraOffsets
                }];
            }
            case "skillspeed": {
                const tierDisplays: TieringDisplay[] = [];
                if (gcdOver) {
                    gcdOver.filter(over => over.basis === 'sks')
                        .forEach(over => {
                            tierDisplays.push({
                                label: over.shortLabel,
                                fullName: over.longLabel,
                                description: over.description,
                                tieringFunc: makeTiering(value => {
                                    const haste = computed.haste(over.attackType) + over.haste;
                                    return sksToGcd(over.gcdTime, levelStats, value, haste);
                                }),
                                extraOffsets: extraOffsets
                            })
                        })
                }
                else {
                    tierDisplays.push({
                        label: abbrev + ' GCD',
                        fullName: 'GCD for weaponskills',
                        description: 'Global cooldown (recast) time for weaponskills',
                        tieringFunc: makeTiering(value => {
                            const haste = computed.haste('Weaponskill');
                            return sksToGcd(2.5, levelStats, value, haste);
                        }),
                        extraOffsets: extraOffsets
                    })
                }

                return [...tierDisplays, {
                    label: abbrev + ' DoT',
                    fullName: 'DoT scalar for weaponskills',
                    description: 'DoT damage multiplier for weaponskills',
                    tieringFunc: makeTiering(value => sksTickMulti(levelStats, value)),
                    extraOffsets: extraOffsets
                }];
            }
            case "tenacity":
                return [{
                    label: abbrev + ' Dmg',
                    fullName: stat + ' multiplier',
                    description: 'Damage multiplier from Tenacity',
                    tieringFunc: makeTiering(value => tenacityDmg(levelStats, value)),
                    extraOffsets: extraOffsets
                }, {
                    label: abbrev + ' Def',
                    fullName: stat + ' mitigation',
                    description: 'Damage reduction from Tenacity',
                    tieringFunc: makeTiering(value => tenacityIncomingDmg(levelStats, value)),
                    extraOffsets: extraOffsets
                }
                ];
            default:
                return [{
                    label: abbrev,
                    fullName: abbrev,
                    description: abbrev,
                    tieringFunc: offset => ({
                        lower: 0,
                        upper: 0
                    }),
                    extraOffsets: []
                }]

        }
    }


    private getCombinedTiering(currentValue: number, computation: ((statValue: number) => number)): Tiering {
        return {
            lower: this.getSingleTiering(false, currentValue, computation),
            upper: this.getSingleTiering(true, currentValue, computation),
        }
    }

    private getSingleTiering(upper: boolean, initialValue: number, computation: (statValue: number) => number) {
        const initialResult = computation(initialValue);
        for (let offset = 0; offset < 1000; offset++) {
            const testValue = upper ? (initialValue + offset) : (initialValue - (offset + 1));
            if (testValue <= 0) {
                return offset;
            }
            const newResult = computation(testValue);
            if (newResult !== initialResult) {
                return offset;
            }
        }
        throw new Error(`Tier computation error: upper: ${upper}; initialValue: ${initialValue}; initialResult: ${initialResult}`);
    }
}

customElements.define('stat-tiering-area', StatTierDisplay, {extends: 'div'});
customElements.define('single-stat-tier-display', SingleStatTierDisplay, {extends: 'div'});
