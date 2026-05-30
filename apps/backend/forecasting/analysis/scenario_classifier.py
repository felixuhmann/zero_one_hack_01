from __future__ import annotations

from enum import Enum


class Scenario(Enum):
    DOVISH_PIVOT = "dovish_pivot"   # Zinssenkung erwartet
    HOLD         = "hold"           # Keine Änderung
    HAWKISH      = "hawkish"        # Zinserhöhung erwartet


# ------------------------------------------------------------------
# Schwellenwerte – zentral definiert, leicht anpassbar
# ------------------------------------------------------------------
HIKE_THRESHOLD_3M   = +0.20   # pp: delta über 3 Monate gilt als Hike-Signal
CUT_THRESHOLD_3M    = -0.20   # pp: delta unter 3 Monate gilt als Cut-Signal
HIKE_THRESHOLD_6M   = +0.35
CUT_THRESHOLD_6M    = -0.35
LABOR_SLACK_CUTOFF  = 4.5     # %: Arbeitslosenquote ab der Slack angenommen wird
PCE_TARGET          = 2.5     # %: Notional Fed-Ziel für Core PCE


class ScenarioClassifier:
    """
    Regelbasierter Szenario-Classifier.

    Nimmt den Output der EnsembleEngine + die rohen Sybilion-Forecasts
    und leitet daraus deterministisch ein Szenario ab.

    Keine LLM-Logik – alle Entscheidungen sind explizite Python-Regeln.
    """

    def classify(self, ensemble_result: dict, raw_forecasts: dict) -> dict:
        """
        Hauptmethode: gibt ein vollständiges Szenario-Dict zurück.

        {
            "scenario":      "hold" | "dovish_pivot" | "hawkish",
            "confidence":    "high" | "medium" | "low",
            "delta_3m":      float,   # erwartete Zinsänderung in 3 Monaten (pp)
            "delta_6m":      float,   # erwartete Zinsänderung in 6 Monaten (pp)
            "pce_trend":     "falling" | "rising" | "stable" | "unknown",
            "pce_latest":    float | None,
            "labor_slack":   bool,
            "unrate_latest": float | None,
            "dgs2_signal":   "inversion" | "normal" | "unknown",
            "trigger":       str,     # menschenlesbare Begründung
            "signals_used":  list[str],
        }
        """
        ensemble_series = ensemble_result.get("ensemble_forecast", {})
        dates = sorted(ensemble_series.keys())

        if len(dates) < 3:
            return self._insufficient_data(dates)

        current = ensemble_series[dates[0]]
        t3      = ensemble_series[dates[2]]
        t6      = ensemble_series[dates[5]] if len(dates) >= 6 else t3

        delta_3m = round(t3 - current, 4)
        delta_6m = round(t6 - current, 4)

        pce_trend, pce_latest   = self._pce_signal(raw_forecasts)
        labor_slack, unrate_val = self._labor_signal(raw_forecasts)
        dgs2_signal             = self._yield_curve_signal(raw_forecasts)

        scenario   = self._apply_rules(delta_3m, delta_6m, pce_trend, labor_slack, dgs2_signal)
        confidence = self._confidence(delta_3m, delta_6m, pce_trend, labor_slack, dgs2_signal)
        trigger    = self._explain(scenario, delta_3m, delta_6m, pce_trend, labor_slack, dgs2_signal)

        return {
            "scenario":      scenario.value,
            "confidence":    confidence,
            "delta_3m":      delta_3m,
            "delta_6m":      delta_6m,
            "pce_trend":     pce_trend,
            "pce_latest":    pce_latest,
            "labor_slack":   labor_slack,
            "unrate_latest": unrate_val,
            "dgs2_signal":   dgs2_signal,
            "trigger":       trigger,
            "signals_used":  ensemble_result.get("contributing_signals", []),
        }

    # ------------------------------------------------------------------
    # Decision Rules
    # ------------------------------------------------------------------

    def _apply_rules(
        self,
        delta_3m: float,
        delta_6m: float,
        pce_trend: str,
        labor_slack: bool,
        dgs2_signal: str,
    ) -> Scenario:
        """
        Regelbaum: von spezifisch nach generisch.
        Alle Schwellenwerte sind in den Modulkonstanten definiert.
        """
        # Starkes Hike-Signal: Rate steigt + Inflation hoch
        if delta_3m >= HIKE_THRESHOLD_3M and pce_trend == "rising":
            return Scenario.HAWKISH

        # Starkes Cut-Signal: Rate fällt + Inflation unter Kontrolle
        if delta_3m <= CUT_THRESHOLD_3M and pce_trend == "falling":
            return Scenario.DOVISH_PIVOT

        # Mittelfristiger Cut durch 6M-Horizont bestätigt
        if delta_6m <= CUT_THRESHOLD_6M and labor_slack:
            return Scenario.DOVISH_PIVOT

        # Yield Curve Inversion + fallende Rate → Pivot
        if dgs2_signal == "inversion" and delta_3m < 0:
            return Scenario.DOVISH_PIVOT

        # Yield Curve normal + steigende Rate → Hawkish
        if dgs2_signal == "normal" and delta_3m >= HIKE_THRESHOLD_3M:
            return Scenario.HAWKISH

        return Scenario.HOLD

    def _confidence(
        self,
        delta_3m: float,
        delta_6m: float,
        pce_trend: str,
        labor_slack: bool,
        dgs2_signal: str,
    ) -> str:
        """
        Konfidenz steigt wenn mehrere Signale in dieselbe Richtung zeigen.
        """
        confirming = 0

        # Rate-Signal klar?
        if abs(delta_3m) >= HIKE_THRESHOLD_3M:
            confirming += 1
        if abs(delta_6m) >= HIKE_THRESHOLD_6M:
            confirming += 1

        # PCE-Trend konsistent?
        if pce_trend in ("falling", "rising"):
            confirming += 1

        # Arbeitsmarkt konsistent?
        if labor_slack:
            confirming += 1

        # Yield Curve bekannt?
        if dgs2_signal != "unknown":
            confirming += 1

        if confirming >= 4:
            return "high"
        elif confirming >= 2:
            return "medium"
        return "low"

    # ------------------------------------------------------------------
    # Signal-Extraktion aus rohen Sybilion-Forecasts
    # ------------------------------------------------------------------

    def _pce_signal(self, raw_forecasts: dict) -> tuple[str, float | None]:
        """Trend der Core PCE Forecast-Serie: falling / rising / stable / unknown."""
        series = self._get_forecast_series(raw_forecasts, "PCEPILFE")
        if not series:
            return "unknown", None

        dates = sorted(series.keys())
        latest = series[dates[-1]]

        if len(dates) < 3:
            return "stable", latest

        early = sum(series[d] for d in dates[:3]) / 3
        late  = sum(series[d] for d in dates[-3:]) / 3

        if late < PCE_TARGET and early - late > 0.1:
            return "falling", latest
        elif late > PCE_TARGET and late - early > 0.1:
            return "rising", latest
        return "stable", latest

    def _labor_signal(self, raw_forecasts: dict) -> tuple[bool, float | None]:
        """True wenn Arbeitslosenquote über LABOR_SLACK_CUTOFF erwartet wird."""
        series = self._get_forecast_series(raw_forecasts, "UNRATE")
        if not series:
            return False, None

        dates = sorted(series.keys())
        latest_val = series[dates[-1]]
        return latest_val > LABOR_SLACK_CUTOFF, round(latest_val, 2)

    def _yield_curve_signal(self, raw_forecasts: dict) -> str:
        """
        Nutzt DGS2-Forecast als Proxy für Yield Curve.
        Wenn 2Y-Yield-Forecast über FEDFUNDS-Forecast → normal.
        Wenn darunter → Inversion (Markt erwartet Zinssenkungen).
        """
        dgs2_series    = self._get_forecast_series(raw_forecasts, "DGS2")
        fedfunds_series = self._get_forecast_series(raw_forecasts, "FEDFUNDS")

        if not dgs2_series or not fedfunds_series:
            return "unknown"

        # Gemeinsame Datenpunkte vergleichen
        common_dates = sorted(
            set(dgs2_series.keys()) & set(fedfunds_series.keys())
        )
        if not common_dates:
            return "unknown"

        # Durchschnittliche Differenz: DGS2 - FEDFUNDS
        diffs = [
            dgs2_series[d] - fedfunds_series[d]
            for d in common_dates
        ]
        avg_diff = sum(diffs) / len(diffs)

        return "inversion" if avg_diff < 0 else "normal"

    # ------------------------------------------------------------------
    # Hilfsmethoden
    # ------------------------------------------------------------------

    def _get_forecast_series(self, raw_forecasts: dict, series_id: str) -> dict:
        try:
            raw_series = raw_forecasts[series_id]["forecast"]["data"]["forecast_series"]
            return {
                date: point["forecast"]
                for date, point in raw_series.items()
                if isinstance(point, dict) and "forecast" in point
            }
        except (KeyError, TypeError):
            return {}

    def _explain(
        self,
        scenario: Scenario,
        delta_3m: float,
        delta_6m: float,
        pce_trend: str,
        labor_slack: bool,
        dgs2_signal: str,
    ) -> str:
        parts = []

        if scenario == Scenario.DOVISH_PIVOT:
            parts.append(f"Zinssenkung erwartet: {delta_3m:+.2f}pp in 3M, {delta_6m:+.2f}pp in 6M")
        elif scenario == Scenario.HAWKISH:
            parts.append(f"Zinserhöhung erwartet: {delta_3m:+.2f}pp in 3M, {delta_6m:+.2f}pp in 6M")
        else:
            parts.append(f"Rate stabil: {delta_3m:+.2f}pp in 3M, {delta_6m:+.2f}pp in 6M")

        if pce_trend == "falling":
            parts.append("Core PCE fällt Richtung Zielwert")
        elif pce_trend == "rising":
            parts.append("Core PCE steigt über Zielwert")

        if labor_slack:
            parts.append(f"Arbeitsmarkt zeigt Slack (UNRATE > {LABOR_SLACK_CUTOFF}%)")

        if dgs2_signal == "inversion":
            parts.append("Yield Curve invertiert (2Y < Fed Rate Forecast)")
        elif dgs2_signal == "normal":
            parts.append("Yield Curve normal")

        return " | ".join(parts)

    def _insufficient_data(self, dates: list) -> dict:
        return {
            "scenario":      Scenario.HOLD.value,
            "confidence":    "low",
            "delta_3m":      0.0,
            "delta_6m":      0.0,
            "pce_trend":     "unknown",
            "pce_latest":    None,
            "labor_slack":   False,
            "unrate_latest": None,
            "dgs2_signal":   "unknown",
            "trigger":       f"Zu wenige Datenpunkte im Ensemble ({len(dates)} verfügbar, mind. 3 nötig)",
            "signals_used":  [],
        }