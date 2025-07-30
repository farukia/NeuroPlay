# features.py
import numpy as np
from scipy.signal import butter, filtfilt

def compute_tremor_energy(signal, fs):
    b, a = butter(4, [3, 8], btype='band', fs=fs)
    filtered = filtfilt(b, a, signal - np.mean(signal))
    return np.sum(filtered ** 2)

def extract_features_from_stroke(stroke):
    import pandas as pd

    if not stroke or len(stroke) < 2:
        return np.full(13, np.nan)

    df = pd.DataFrame(stroke)
    df['Timestamp'] = df['timestamp'] - df['timestamp'][0]
    df['Timestamp'] = df['Timestamp'] / 1000

    time_diffs = np.diff(df['Timestamp'].values)
    fs = 1 / np.median(time_diffs) if len(time_diffs) > 0 else 100

    features = []
    for col in ['x', 'y', 'pressure']:
        signal = df[col].astype(float).values
        features.append(np.mean(signal))
        features.append(np.std(signal))
        features.append(np.ptp(signal))
        features.append(compute_tremor_energy(signal, fs))

    dx = np.diff(df['x'].astype(float).values)
    dy = np.diff(df['y'].astype(float).values)
    dt = np.diff(df['Timestamp'].values) + 1e-6
    distances = np.sqrt(dx**2 + dy**2)
    speeds = distances / dt

    distance_total = np.sum(distances)
    duration = df['Timestamp'].iloc[-1]
    speed_mean = np.mean(speeds)
    speed_std = np.std(speeds)

    features.extend([distance_total, duration, speed_mean, speed_std])

    return np.array(features)
