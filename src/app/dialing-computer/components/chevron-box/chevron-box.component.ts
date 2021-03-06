import { AfterViewInit, Component, ElementRef, Input, NgZone, OnDestroy, ViewChild } from "@angular/core";
import { Actions, ofType } from "@ngrx/effects";
import { select, Store } from "@ngrx/store";
import { chevronFailed, engageChevron, failChevron, sequenceComplete } from "app/dialing-computer/actions";
import { ChevronBoxAnimationConfig, ChevronBoxAnimations } from "app/dialing-computer/animations";
import { getGateStatus } from "app/dialing-computer/selectors";
import { GateStatus, Glyph } from "app/shared/models";
import { BehaviorSubject, Subject } from "rxjs";
import { filter, take, takeUntil } from "rxjs/operators";

@Component({
	selector: "sg-chevron-box",
	templateUrl: "./chevron-box.component.html",
	styleUrls: ["./chevron-box.component.scss"],
})
export class ChevronBoxComponent implements AfterViewInit, OnDestroy {
	@Input("gatePosition") gatePosition$: BehaviorSubject<DOMRect>;
	@Input() number: number;

	@ViewChild("chevronBox", { static: true }) private _chevronBox: ElementRef;
	@ViewChild("symbol", { static: true }) private _symbol: ElementRef;

	public glyph: Glyph;
	private animation: gsap.core.Timeline;
	private killSubscriptions: Subject<{}> = new Subject();
	private position: DOMRect;

	private get chevronBox(): HTMLElement {
		return this._chevronBox.nativeElement;
	}

	private get symbol(): HTMLElement {
		return this._symbol.nativeElement;
	}

	constructor(private actions$: Actions, private ngZone: NgZone, private store$: Store<any>) {}

	ngOnDestroy() {
		this.killSubscriptions.next();
	}

	ngAfterViewInit() {
		this.store$.pipe(select(getGateStatus), takeUntil(this.killSubscriptions)).subscribe((status) => {
			if (status === GateStatus.Idle) {
				this.clearSymbol();
				this.killAnimations();
			} else if (status === GateStatus.Aborted) {
				this.killAnimations();
			}
		});

		this.actions$
			.pipe(
				ofType(engageChevron, failChevron),
				filter(({ chevron }) => chevron === this.number),
				takeUntil(this.killSubscriptions),
			)
			.subscribe(async ({ chevron, glyph, type }) => {
				this.glyph = glyph;
				let gatePos = await this.getLatestGatePosition();
				if (type === engageChevron.type) {
					this.lockSymbolSuccess(gatePos);
				} else {
					this.lockSymbolFailed(gatePos).add(() =>
						this.ngZone.run(() => this.store$.dispatch(chevronFailed(chevron))),
					);
				}
			});

		this.actions$
			.pipe(ofType(sequenceComplete), takeUntil(this.killSubscriptions))
			.subscribe(() => ChevronBoxAnimations.flashOnActivate(this.chevronBox));
	}

	public clearSymbol(): void {
		ChevronBoxAnimations.clearSymbol(this.chevronBox, this.symbol);
		this.glyph = undefined;
	}

	public lockSymbolFailed(gatePosition: DOMRect): gsap.core.Timeline {
		return (this.animation = ChevronBoxAnimations.lockSymbolFailed(this.buildAnimationConfig(gatePosition)));
	}

	public lockSymbolSuccess(gatePosition: DOMRect): gsap.core.Timeline {
		return (this.animation = ChevronBoxAnimations.lockSymbolSuccess(this.buildAnimationConfig(gatePosition)));
	}

	private buildAnimationConfig(gatePosition: DOMRect): ChevronBoxAnimationConfig {
		this.updateSymbolPosition();

		return {
			chevronBox: this.chevronBox,
			centerY: gatePosition.y + gatePosition.height / 2 - this.position.y - this.position.height / 2,
			startX: gatePosition.x + gatePosition.width / 2 - this.position.x - this.position.width / 2,
			startY: gatePosition.y - this.position.y + 50,
			symbol: this.symbol,
		};
	}

	private async getLatestGatePosition(): Promise<DOMRect> {
		return this.gatePosition$
			.pipe(
				filter((pos) => !!pos),
				take(1),
			)
			.toPromise();
	}

	private killAnimations(): void {
		if (!!this.animation) {
			this.animation.kill();
			this.animation = undefined;
		}
	}

	private updateSymbolPosition(): void {
		this.position = this.symbol.getBoundingClientRect() as DOMRect;
	}
}
