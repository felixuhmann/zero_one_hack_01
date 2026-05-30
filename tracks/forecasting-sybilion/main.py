import json
import os

from fed_rate_pipeline import FedRatePipeline
from analysis import EnsembleEngine, ScenarioClassifier


if __name__ == "__main__":
    pipeline = FedRatePipeline()
    # drivers_payload = pipeline.run()

    # payload_path = "artifacts/fed_rate_forecast/drivers_payload.json"
    # os.makedirs(os.path.dirname(payload_path), exist_ok=True)
    # with open(payload_path, "w", encoding="utf-8") as f:
    #     json.dump(drivers_payload, f, indent=2)
    # print(f"Wrote {payload_path}")

    # drivers_path = "artifacts/fed_rate_forecast/drivers.json"
    # pipeline.get_drivers(output_path=drivers_path)
    # print(f"Wrote {drivers_path}")

    result = pipeline.run()

    print("\nOrchestrator results:")
    for series_id, item in result.get("signals", {}).items():
        if item is None:
            print(f"- {series_id}: failed")
            continue

        forecast = item.get("forecast")
        status = item["job"].get("status")
        print(
            f"- {series_id}: status={status}, "
            f"weight={item['weight']}, "
            f"forecast_points={len(forecast.get('data', {}).get('forecast_series', [])) if forecast else 0}"
        )

    if "ensemble" in result:
        ensemble = result["ensemble"]
        print("\nEnsemble summary:")
        print(f"- contributing_signals: {ensemble.get('contributing_signals', [])}")
        print(f"- normalized_weights: {ensemble.get('normalized_weights', {})}")
        print(f"- dropped_signals: {ensemble.get('dropped_signals', [])}")

    if "scenario" in result:
        scenario = result["scenario"]
        print("\nScenario classification:")
        print(f"- scenario: {scenario.get('scenario')}")
        print(f"- confidence: {scenario.get('confidence')}")
        print(f"- trigger: {scenario.get('trigger')}")
