from __future__ import annotations

from enum import Enum

from forecasting.analysis.forecast_series import extract_forecast_series_from_signal


class Scenario(Enum):
    DOVISH_PIVOT = "dovish_pivot"   # Zinssenkung erwartet
    HOLD         = "hold"           # Keine Änderung
    HAWKISH      = "hawkish"        # Zinserhöhung erwartet


# ------------------------------------------------------------------
# Schwellenwerte – zentral definiert, leicht anpassbar
# ------------------------------------------------------------------
HIKE_THRESHOLD_3M  = +0.20
CUT_THRESHOLD_3M   = -0.20
HIKE_THRESHOLD_6M  = +0.35
CUT_THRESHOLD_6M   = -0.35
LABOR_SLACK_CUTOFF = 4.5     # %: Arbeitslosenquote ab der Slack angenommen wird
INFLATION_TARGET   = 2.5     # %: Notional Inflationsziel (Fed ~2.5%, ECB 2.0%)
INFLATION_DELTA    = 0.1     # pp: Mindestbewegung für Trend-Klassifikation


# ------------------------------------------------------------------
# Rollen – verbinden Signal-Configs mit Classifier-Logik
# ------------------------------------------------------------------
class SignalRole:
    TARGET    = "target"     # Leitzins selbst (FEDFUNDS, ECBDFR, ...)
    LEADING   = "leading"    # Marktbasierter Vorlaufindikator (DGS2, IRLTLT01EZM156N, ...)
    INFLATION = "inflation"  # Inflationsserie (PCEPILFE, CP0000EZ19M086NEST, ...)
    LABOR     = "labor"      # Arbeitsmarkt (UNRATE, UEMPEA, ...)
    CONTEXT   = "context"    # Zusatzindikatoren (NAPM, NFCI, ...) — nur Ensemble, nicht Classifier


class ScenarioClassifier:
    """
    Regelbasierter Szenario-Classifier — zentralbank-agnostisch.

    Statt hardcodierter Series-IDs (z.B. "PCEPILFE", "DGS2") sucht der
    Classifier Signale über ihre Rolle in signal_configs. Dadurch funktioniert
    derselbe Classifier für Fed, ECB und BoJ ohne Änderungen.

    Verwendung:
        classifier = ScenarioClassifier()
        result = classifier.classify(ensemble_result, raw_forecasts, signal_configs)
    """

    def classify(
        self,
        ensemble_result: dict,
        raw_forecasts: dict,
        signal_configs: list[dict],
    ) -> dict:
        ensemble_series = ensemble_result.get("ensemble_forecast", {})
        dates = sorted(ensemble_series.keys())

        if len(dates) < 3:
            return self._insufficient_data(dates)

        current  = ensemble_series[dates[0]]
        t3       = ensemble_series[dates[2]]
        t6       = ensemble_series[dates[5]] if len(dates) >= 6 else t3
        delta_3m = round(t3 - current, 4)
        delta_6m = round(t6 - current, 4)

        role_map = self._build_role_map(signal_configs)

        inflation_trend, inflation_latest = self._inflation_signal(raw_forecasts, role_map)
        labor_slack, labor_latest         = self._labor_signal(raw_forecasts, role_map)
        yield_signal                      = self._yield_curve_signal(raw_forecasts, role_map)

        scenario   = self._apply_rules(delta_3m, delta_6m, inflation_trend, labor_slack, yield_signal)
        confidence = self._confidence(delta_3m, delta_6m, inflation_trend, labor_slack, yield_signal)
        trigger    = self._explain(scenario, delta_3m, delta_6m, inflation_trend, labor_slack, yield_signal)

        return {
            "scenario":         scenario.value,
            "confidence":       confidence,
            "delta_3m":         delta_3m,
            "delta_6m":         delta_6m,
            "inflation_trend":  inflation_trend,
            "inflation_latest": inflation_latest,
            "labor_slack":      labor_slack,
            "labor_latest":     labor_latest,
            "yield_signal":     yield_signal,
            "trigger":          trigger,
            "signals_used":     ensemble_result.get("contributing_signals", []),
        }

    # ------------------------------------------------------------------
    # Decision Rules
    # ------------------------------------------------------------------

    def _apply_rules(
        self,
        delta_3m: float,
        delta_6m: float,
        inflation_trend: str,
        labor_slack: bool,
        yield_signal: str,
    ) -> Scenario:
        # Starkes Hike-Signal: Rate steigt + Inflation hoch
        if delta_3m >= HIKE_THRESHOLD_3M and inflation_trend == "rising":
            return Scenario.HAWKISH

        # Starkes Cut-Signal: Rate fällt + Inflation unter Kontrolle
        if delta_3m <= CUT_THRESHOLD_3M and inflation_trend in ("falling", "stable"):
            return Scenario.DOVISH_PIVOT

        # Rate fällt deutlich — auch ohne Inflations-Signal
        if delta_3m <= CUT_THRESHOLD_3M and inflation_trend == "unknown":
            return Scenario.DOVISH_PIVOT

        # Mittelfristiger Cut durch 6M-Horizont + schwacher Arbeitsmarkt bestätigt
        if delta_6m <= CUT_THRESHOLD_6M and labor_slack:
            return Scenario.DOVISH_PIVOT

        # Yield Curve Inversion + fallende Rate → Pivot
        if yield_signal == "inversion" and delta_3m < 0:
            return Scenario.DOVISH_PIVOT

        # Yield Curve normal + steigende Rate → Hawkish
        if yield_signal == "normal" and delta_3m >= HIKE_THRESHOLD_3M:
            return Scenario.HAWKISH

        return Scenario.HOLD

    def _confidence(
        self,
        delta_3m: float,
        delta_6m: float,
        inflation_trend: str,
        labor_slack: bool,
        yield_signal: str,
    ) -> str:
        confirming = 0

        if abs(delta_3m) >= HIKE_THRESHOLD_3M:
            confirming += 1
        if abs(delta_6m) >= HIKE_THRESHOLD_6M:
            confirming += 1
        if inflation_trend in ("falling", "rising"):
            confirming += 1
        if labor_slack:
            confirming += 1
        if yield_signal != "unknown":
            confirming += 1

        if confirming >= 4:
            return "high"
        elif confirming >= 2:
            return "medium"
        return "low"

    # ------------------------------------------------------------------
    # Signal-Extraktion — rollenbasiert
    # ------------------------------------------------------------------

    def _inflation_signal(
        self,
        raw_forecasts: dict,
        role_map: dict[str, str],
    ) -> tuple[str, float | None]:
        series = self._series_by_role(raw_forecasts, role_map, SignalRole.INFLATION)
        if not series:
            return "unknown", None

        dates  = sorted(series.keys())
        latest = series[dates[-1]]

        if len(dates) < 3:
            return "stable", latest

        early = sum(series[d] for d in dates[:3]) / 3
        late  = sum(series[d] for d in dates[-3:]) / 3

        if late < INFLATION_TARGET and early - late > INFLATION_DELTA:
            return "falling", latest
        elif late > INFLATION_TARGET and late - early > INFLATION_DELTA:
            return "rising", latest
        return "stable", latest

    def _labor_signal(
        self,
        raw_forecasts: dict,
        role_map: dict[str, str],
    ) -> tuple[bool, float | None]:
        series = self._series_by_role(raw_forecasts, role_map, SignalRole.LABOR)
        if not series:
            return False, None

        dates      = sorted(series.keys())
        latest_val = series[dates[-1]]
        return latest_val > LABOR_SLACK_CUTOFF, round(latest_val, 2)

    def _yield_curve_signal(
        self,
        raw_forecasts: dict,
        role_map: dict[str, str],
    ) -> str:
        leading_series = self._series_by_role(raw_forecasts, role_map, SignalRole.LEADING)
        target_series  = self._series_by_role(raw_forecasts, role_map, SignalRole.TARGET)

        if not leading_series or not target_series:
            return "unknown"

        common_dates = sorted(
            set(leading_series.keys()) & set(target_series.keys())
        )
        if not common_dates:
            return "unknown"

        diffs    = [leading_series[d] - target_series[d] for d in common_dates]
        avg_diff = sum(diffs) / len(diffs)

        return "inversion" if avg_diff < 0 else "normal"

    # ------------------------------------------------------------------
    # Hilfsmethoden
    # ------------------------------------------------------------------

    @staticmethod
    def _build_role_map(signal_configs: list[dict]) -> dict[str, str]:
        """
        Baut einen Index: role → series_id.
        Nur die erste Serie pro Rolle wird verwendet.

        Beispiel:
            [{"series_id": "FEDFUNDS", "role": "target", ...}]
            → {"target": "FEDFUNDS"}
        """
        role_map = {}
        for cfg in signal_configs:
            role = cfg.get("role")
            if role and role not in role_map:
                role_map[role] = cfg["series_id"]
        return role_map

    def _series_by_role(
        self,
        raw_forecasts: dict,
        role_map: dict[str, str],
        role: str,
    ) -> dict[str, float]:
        series_id = role_map.get(role)
        if not series_id:
            return {}
        return extract_forecast_series_from_signal(raw_forecasts.get(series_id))

    def _explain(
        self,
        scenario: Scenario,
        delta_3m: float,
        delta_6m: float,
        inflation_trend: str,
        labor_slack: bool,
        yield_signal: str,
    ) -> str:
        parts = []

        if scenario == Scenario.DOVISH_PIVOT:
            parts.append(f"Zinssenkung erwartet: {delta_3m:+.2f}pp in 3M, {delta_6m:+.2f}pp in 6M")
        elif scenario == Scenario.HAWKISH:
            parts.append(f"Zinserhöhung erwartet: {delta_3m:+.2f}pp in 3M, {delta_6m:+.2f}pp in 6M")
        else:
            parts.append(f"Rate stabil: {delta_3m:+.2f}pp in 3M, {delta_6m:+.2f}pp in 6M")

        if inflation_trend == "falling":
            parts.append("Inflation fällt Richtung Zielwert")
        elif inflation_trend == "rising":
            parts.append("Inflation steigt über Zielwert")
        elif inflation_trend == "unknown":
            parts.append("Inflations-Signal nicht verfügbar")

        if labor_slack:
            parts.append(f"Arbeitsmarkt zeigt Slack (>{LABOR_SLACK_CUTOFF}%)")

        if yield_signal == "inversion":
            parts.append("Yield Curve invertiert (Leading Yield < Leitzins)")
        elif yield_signal == "normal":
            parts.append("Yield Curve normal")

        return " | ".join(parts)

    def _insufficient_data(self, dates: list) -> dict:
        return {
            "scenario":         Scenario.HOLD.value,
            "confidence":       "low",
            "delta_3m":         0.0,
            "delta_6m":         0.0,
            "inflation_trend":  "unknown",
            "inflation_latest": None,
            "labor_slack":      False,
            "labor_latest":     None,
            "yield_signal":     "unknown",
            "trigger":          f"Zu wenige Datenpunkte ({len(dates)} verfügbar, mind. 3 nötig)",
            "signals_used":     [],
        }