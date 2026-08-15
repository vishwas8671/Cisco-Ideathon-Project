import sys
import os
import yaml

# Ensure package directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from validator.parser import CommandParser
from validator.rules import RuleEngine

def load_site_config(yaml_path):
    if not os.path.exists(yaml_path):
        print(f"Error: Site configuration file not found at {yaml_path}", file=sys.stderr)
        sys.exit(1)
    
    try:
        with open(yaml_path, 'r') as f:
            config = yaml.safe_load(f)
            if not config:
                print(f"Error: Site configuration file at {yaml_path} is empty", file=sys.stderr)
                sys.exit(1)
            return config
    except Exception as e:
        print(f"Error reading site configuration: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    if len(sys.argv) < 3:
        print("Usage: python -m validator.main <path_to_site.yaml> <path_to_device_log.txt>", file=sys.stderr)
        sys.exit(1)

    yaml_path = sys.argv[1]
    log_path = sys.argv[2]

    if not os.path.exists(log_path):
        print(f"Error: Device log file not found at {log_path}", file=sys.stderr)
        sys.exit(1)

    # 1. Load configuration
    site_config = load_site_config(yaml_path)

    # 2. Parse command logs
    parser = CommandParser()
    try:
        parsed_data = parser.parse_file(log_path)
    except Exception as e:
        print(f"Error parsing device log file: {e}", file=sys.stderr)
        sys.exit(1)

    # 3. Run validation rules
    engine = RuleEngine(site_config, parsed_data)
    findings = engine.run_all_checks()

    # 4. Print results
    if not findings:
        print("Validation Successful: 0 findings.")
    else:
        for idx, finding in enumerate(findings, 1):
            summary = finding["summary"]
            symptom = finding["symptom"]
            fix = finding["fix"].replace('\n', '\n               ') # Indent fix commands nicely
            
            print(f"{summary}")
            print(f"Symptom: {symptom}")
            print(f"Suggested fix: {finding['fix']}")
            print("-" * 50)

if __name__ == "__main__":
    main()
