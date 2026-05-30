from __future__ import annotations

import json

from api.fred_api import FREDClient
from api.sybilion_forecast_api import SybilionForecastApiClient
from analysis.ensemble_engine import EnsembleEngine
from analysis.scenario_classifier import ScenarioClassifier
from fed_rate_pipeline import FedRatePipeline
from payloads.fed_rate_payloads import FedRatePayloadBuilder, US_SIGNAL_CONFIGS
from payloads.ecb_rate_payloads import ECBRatePayloadBuilder, ECB_SIGNAL_CONFIGS
# from payloads.boj_rate_payloads import BoJRatePayloadBuilder, BOJ_SIGNAL_CONFIGS


def build_pipeline(
    fred: FREDClient,
    payload_builder,
    artifacts_dir: str,
) -> FedRatePipeline:
    """Baut eine Pipeline-Instanz mit geteilten Abhängigkeiten."""
    return FedRatePipeline(
        fred_client=fred,
        forecast_client=SybilionForecastApiClient(),
        payload_builder=payload_builder,
        ensemble_engine=EnsembleEngine(),
        scenario_classifier=ScenarioClassifier(),
        artifacts_base_dir=artifacts_dir,
    )


def main() -> None:
    fred = FREDClient()

    # ------------------------------------------------------------------
    # Fed (USA)
    # ------------------------------------------------------------------
    # fed_pipeline = build_pipeline(
    #     fred=fred,
    #     payload_builder=FedRatePayloadBuilder(fred),
    #     artifacts_dir="artifacts/fed",
    # )

    # print("=" * 50)
    # print("FED FORECAST")
    # print("=" * 50)
    # fed_result = fed_pipeline.run(signal_configs=US_SIGNAL_CONFIGS)
    # _print_result(fed_result)

    # ------------------------------------------------------------------
    # ECB (Euro Area) — aktivieren sobald ECB-Builder fertig
    # ------------------------------------------------------------------
    ecb_pipeline = build_pipeline(
        fred=fred,
        payload_builder=ECBRatePayloadBuilder(fred),
        artifacts_dir="artifacts/ecb",
    )
    print("=" * 50)
    print("ECB FORECAST")
    print("=" * 50)
    ecb_result = ecb_pipeline.run(signal_configs=ECB_SIGNAL_CONFIGS)
    _print_result(ecb_result)

    # ------------------------------------------------------------------
    # BoJ (Japan) — aktivieren sobald BoJ-Builder fertig
    # ------------------------------------------------------------------
    # boj_pipeline = build_pipeline(
    #     fred=fred,
    #     payload_builder=BoJRatePayloadBuilder(fred),
    #     artifacts_dir="artifacts/boj",
    # )
    # print("=" * 50)
    # print("BOJ FORECAST")
    # print("=" * 50)
    # boj_result = boj_pipeline.run(signal_configs=BOJ_SIGNAL_CONFIGS)
    # _print_result(boj_result)


def _print_result(result: dict) -> None:
    scenario = result.get("scenario", {})
    ensemble = result.get("ensemble", {})

    print(f"Szenario:   {scenario.get('scenario', 'N/A').upper()}")
    print(f"Konfidenz:  {scenario.get('confidence', 'N/A')}")
    print(f"Delta 3M:   {scenario.get('delta_3m', 0):+.3f} pp")
    print(f"Delta 6M:   {scenario.get('delta_6m', 0):+.3f} pp")
    print(f"PCE Trend:  {scenario.get('pce_trend', 'N/A')}")
    print(f"Trigger:    {scenario.get('trigger', 'N/A')}")
    print(f"Signale:    {', '.join(ensemble.get('contributing_signals', []))}")
    print(f"Gewichte:   {json.dumps(ensemble.get('normalized_weights', {}))}")
    print()


if __name__ == "__main__":
    main()
