from __future__ import annotations


class EnsembleEngine:
    """
    Führt mehrere Sybilion-Forecasts (je ein Job pro FRED-Serie) zu einem
    gewichteten Ensemble-Forecast zusammen.

    Erwartet als Input das dict, das FedForecastOrchestrator.run() zurückgibt:
    {
        "FEDFUNDS": {"forecast": forecast_json, "weight": 0.30, "job": ..., "series_id": ...},
        "DGS2":     {"forecast": forecast_json, "weight": 0.25, ...},
        ...
    }
    """

    def synthesize(self, raw_forecasts: dict) -> dict:
        """
        Gewichteter Durchschnitt der Forecast-Serien über alle validen Jobs.

        - Ungültige / fehlgeschlagene Jobs werden herausgefiltert.
        - Gewichte werden auf 1.0 renormalisiert falls Jobs fehlen.
        - Gibt eine ensemble_forecast Zeitreihe + Metadaten zurück.
        """
        valid = self._filter_valid(raw_forecasts)

        if not valid:
            raise RuntimeError(
                "Keine validen Forecasts verfügbar – alle Jobs fehlgeschlagen oder leer."
            )

        total_weight = sum(d["weight"] for d in valid.values())
        normalized_weights = {
            sid: round(d["weight"] / total_weight, 4)
            for sid, d in valid.items()
        }

        ensemble_series = self._weighted_average(valid, total_weight)
        backtest_metrics = self._aggregate_backtest_metrics(valid, normalized_weights)

        return {
            "ensemble_forecast": ensemble_series,
            "contributing_signals": list(valid.keys()),
            "normalized_weights": normalized_weights,
            "dropped_signals": [
                sid for sid in raw_forecasts if sid not in valid
            ],
            "backtest": backtest_metrics,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _filter_valid(self, raw_forecasts: dict) -> dict:
        """Behält nur Jobs mit einem verwertbaren forecast_series."""
        valid = {}
        for sid, data in raw_forecasts.items():
            if not data:
                continue
            forecast_series = self._extract_forecast_series(data)
            if forecast_series:
                valid[sid] = data
        return valid

    def _extract_forecast_series(self, data: dict) -> dict:
        """Extrahiert die numerischen Forecast-Werte aus forecast_series."""
        try:
            raw_series = data["forecast"]["data"]["forecast_series"]
            return {
                date: point["forecast"]
                for date, point in raw_series.items()
                if isinstance(point, dict) and "forecast" in point
            }
        except (KeyError, TypeError):
            return {}

    def _weighted_average(self, valid: dict, total_weight: float) -> dict:
        """
        Berechnet den gewichteten Durchschnitt über alle Zeitpunkte.
        Fehlende Datenpunkte für einzelne Serien werden übersprungen –
        der Gewicht-Anteil wird für diesen Zeitpunkt anteilig neu normalisiert.
        """
        # Alle Zeitpunkte sammeln
        all_dates: set[str] = set()
        for data in valid.values():
            all_dates.update(self._extract_forecast_series(data).keys())

        ensemble: dict[str, float] = {}
        for date in sorted(all_dates):
            weighted_sum = 0.0
            active_weight = 0.0
            for sid, data in valid.items():
                series = self._extract_forecast_series(data)
                if date in series:
                    w = data["weight"] / total_weight
                    weighted_sum += series[date] * w
                    active_weight += w

            # Re-normalisieren falls ein Signal keinen Wert für diesen Zeitpunkt hat
            if active_weight > 0:
                ensemble[date] = round(weighted_sum / active_weight, 4)

        return ensemble

    def _aggregate_backtest_metrics(
        self, valid: dict, normalized_weights: dict
    ) -> dict:
        """
        Gewichteter Durchschnitt der Backtest-Metriken (MAE, MAPE, RMSE)
        über alle validen Signale und verfügbaren Horizonte.
        """
        horizon_buckets: dict[str, dict[str, list]] = {}

        for sid, data in valid.items():
            w = normalized_weights[sid]
            try:
                backtest = data["forecast"]["data"]["backtest"]
            except (KeyError, TypeError):
                continue

            for horizon, hdata in backtest.items():
                metrics = hdata.get("metrics", {})
                if not metrics:
                    continue
                if horizon not in horizon_buckets:
                    horizon_buckets[horizon] = {
                        "MAE": [], "MAPE": [], "RMSE": [],
                        "weights": [],
                    }
                for key in ("MAE", "MAPE", "RMSE"):
                    if key in metrics:
                        horizon_buckets[horizon][key].append(metrics[key] * w)
                horizon_buckets[horizon]["weights"].append(w)

        aggregated = {}
        for horizon, bucket in horizon_buckets.items():
            total_w = sum(bucket["weights"])
            if total_w == 0:
                continue
            aggregated[horizon] = {
                key: round(sum(bucket[key]) / total_w, 6)
                for key in ("MAE", "MAPE", "RMSE")
                if bucket[key]
            }

        return aggregated