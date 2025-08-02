# BWSI Medlytics Capstone Project!
## NeuroPlay: A Multi-Modal Game-Based Diagnostic Tool for Early Detection and Staging for Parkinson’s Disease
### By Ayesha, Ananya, and Yeowon
We're utilizing spiral drawing test and telemonitoring voice data to identify Parkinson's in its earlier stages and track disease progression.
Currently a work-in-progress!

#  Overview
NeuroPlay combines motor and vocal data analysis to help detect Parkinson’s Disease in its early stages and monitor its progression over time. We use two key inputs:
- **Spiral Drawing Tests** (motor function)
- **Voice Telemonitoring Data** (vocal biomarkers)

Our goal: create an engaging, user-friendly diagnostic tool that supports clinicians with objective, AI-backed insights.

---

##  Features
-  **Drawing Module**: Users complete a spiral drawing task via touchscreen.
-  **Voice Module**: Users upload or record audio for telemonitoring analysis.
-  **Machine Learning Backend**: Models classify disease stage and risk level using preprocessed data.
-  **Real-Time Feedback**: Instant visualization of results and model confidence.
-  **Designed for Accessibility**: Simple interface built for patients, caregivers, and clinicians alike.

---

## Tech Stack
| Layer        | Tools Used               |
|--------------|--------------------------|
| Frontend     | Typescript, Javascript   |
| Backend      | Python, Flask            |
| ML Framework | Random Forest Models     |

## How to Use (with Expo)
1. Clone the repo:
   ```bash
   git clone https://github.com/farukia/NeuroPlay.git
   cd NeuroPlay
   npx expo start
