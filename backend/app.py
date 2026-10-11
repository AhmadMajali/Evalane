from flask import Flask, jsonify, request
from flask_cors import CORS
from evalane_sim_pipeline import EvalaneSimPipeline
import __main__
__main__.EvalaneSimPipeline = EvalaneSimPipeline
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Load the pipeline once when the server starts
import pickle
from pathlib import Path

MODEL_PATH = Path(__file__).resolve().parent / "evalane_sim_pipeline.pkl"
with open(MODEL_PATH, "rb") as f:
    pipeline = pickle.load(f)
print("Pipeline loaded successfully!")

@app.route('/')
def home():
    return jsonify({'message': 'Evalane API is running'})

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()

        # Build the observation from the request
        observation = {

            "Lane_N_Count":       data.get("Lane_N_Count", 0),
            "Lane_S_Count":       data.get("Lane_S_Count", 0),
            "Lane_E_Count":       data.get("Lane_E_Count", 0),
            "Lane_W_Count":       data.get("Lane_W_Count", 0),
            "Congestion_N":          data.get("Congestion_N", 0.0),
            "Congestion_S":          data.get("Congestion_S", 0.0),
            "Congestion_E":          data.get("Congestion_E", 0.0),
            "Congestion_W":          data.get("Congestion_W", 0.0),
            "Current_Green_Lane":    data.get("Current_Green_Lane", "N"),
            "Green_Timer_Remaining": data.get("Green_Timer_Remaining", 30),
            "Event_Type":         data.get("Event_Type", "Normal"),
            "Event_Lane":         data.get("Event_Lane", None),
        }

        result = pipeline.predict(observation)
        return jsonify(result)

    except Exception as e:
        print("ERROR:", e)
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)