import time
import pandas as pd
import numpy as np
import logging
import warnings

warnings.filterwarnings("ignore")

logger = logging.getLogger(__name__)


class LSTMModel:
    def __init__(self, window_size: int = 30, mc_samples: int = 50):
        self.name = "lstm"
        self.display_name = "LSTM Neural Network"
        self.description = (
            "Long Short-Term Memory deep learning model with Monte Carlo Dropout "
            "uncertainty quantification."
        )
        self.window_size = window_size
        self.mc_samples = mc_samples
        self.model = None
        self.scaler = None
        self._trained = False
        self._last_window = None

    def _build_model(self):
        import tensorflow as tf
        from tensorflow.keras import Sequential
        from tensorflow.keras.layers import LSTM, Dense, Dropout
        from tensorflow.keras.optimizers import Adam

        model = Sequential(
            [
                LSTM(64, return_sequences=True, input_shape=(self.window_size, 1)),
                Dropout(0.2),
                LSTM(32, return_sequences=False),
                Dropout(0.2),
                Dense(16, activation="relu"),
                Dense(1),
            ]
        )
        model.compile(optimizer=Adam(learning_rate=0.001), loss="mse")
        return model

    def _create_sequences(self, data: np.ndarray):
        X, y = [], []
        for i in range(self.window_size, len(data)):
            X.append(data[i - self.window_size : i, 0])
            y.append(data[i, 0])
        return np.array(X), np.array(y)

    def fit(self, train: pd.DataFrame) -> None:
        from sklearn.preprocessing import MinMaxScaler
        import tensorflow as tf

        tf.get_logger().setLevel("ERROR")

        values = train["total_calls"].values.reshape(-1, 1).astype(float)
        self.scaler = MinMaxScaler(feature_range=(0, 1))
        scaled = self.scaler.fit_transform(values)

        X, y = self._create_sequences(scaled)
        X = X.reshape((X.shape[0], X.shape[1], 1))

        from app.config import get_settings

        settings = get_settings()

        self.model = self._build_model()
        self.model.fit(
            X,
            y,
            epochs=settings.LSTM_EPOCHS,
            batch_size=settings.LSTM_BATCH_SIZE,
            validation_split=0.1,
            verbose=0,
            callbacks=[
                __import__("tensorflow").keras.callbacks.EarlyStopping(
                    patience=8, restore_best_weights=True
                )
            ],
        )
        self._trained = True
        self._last_window = scaled[-self.window_size :]
        logger.info("LSTM model trained successfully")

    def predict(self, horizon: int, confidence_intervals: list[float]) -> dict:
        if not self._trained:
            raise RuntimeError("LSTM model must be fitted before prediction")
        import tensorflow as tf

        all_predictions = []

        for _ in range(self.mc_samples):
            current_window = self._last_window.copy()
            preds = []
            for _ in range(horizon):
                x_input = current_window[-self.window_size :].reshape(
                    1, self.window_size, 1
                )
                # MC Dropout: call model with training=True to keep dropout active
                pred = self.model(x_input, training=True).numpy()[0, 0]
                preds.append(pred)
                current_window = np.append(current_window, [[pred]], axis=0)
            all_predictions.append(preds)

        all_predictions = np.array(all_predictions)  # (mc_samples, horizon)
        mean_preds = np.mean(all_predictions, axis=0)

        # Inverse transform
        def inverse(arr):
            return self.scaler.inverse_transform(arr.reshape(-1, 1)).flatten()

        mean_values = np.maximum(0, inverse(mean_preds))

        # CI percentiles
        ci_80_lower = np.maximum(
            0, inverse(np.percentile(all_predictions, 10, axis=0))
        )
        ci_80_upper = np.maximum(
            0, inverse(np.percentile(all_predictions, 90, axis=0))
        )
        ci_95_lower = np.maximum(
            0, inverse(np.percentile(all_predictions, 2.5, axis=0))
        )
        ci_95_upper = np.maximum(
            0, inverse(np.percentile(all_predictions, 97.5, axis=0))
        )

        return {
            "values": mean_values.tolist(),
            "ci": {
                "0.80": {
                    "lower": ci_80_lower.tolist(),
                    "upper": ci_80_upper.tolist(),
                },
                "0.95": {
                    "lower": ci_95_lower.tolist(),
                    "upper": ci_95_upper.tolist(),
                },
            },
        }

    def run_full(
        self,
        train: pd.DataFrame,
        test: pd.DataFrame,
        horizon: int,
        ci_levels: list[float],
    ) -> dict:
        from app.utils.metrics import compute_all_metrics, recommendation_score

        start = time.time()

        self.fit(train)
        test_preds = self.predict(len(test), [])
        actual = test["total_calls"].values
        predicted = np.array(test_preds["values"])
        metrics = compute_all_metrics(actual, predicted)
        metrics["recommendation_score"] = recommendation_score(metrics["mape"])

        all_data = pd.concat([train, test])
        self.fit(all_data)
        forecast = self.predict(horizon, ci_levels)

        elapsed = round(time.time() - start, 2)
        return {
            "metrics": metrics,
            "forecast": forecast,
            "training_time_seconds": elapsed,
            "params_used": {
                "window_size": self.window_size,
                "lstm_units": [64, 32],
                "dropout": 0.2,
                "mc_samples": self.mc_samples,
            },
        }
