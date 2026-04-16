"""ComfyUI provider for FLUX.1-schnell image generation.

Interfaces with a local ComfyUI server via HTTP API to generate
text-to-image outputs using a stored workflow JSON.
"""

import json
import logging
import os
import time
from pathlib import Path
from urllib.parse import urlencode

import requests

logger = logging.getLogger(__name__)

DEFAULT_COMFYUI_URL = "http://127.0.0.1:8188"
POLL_INTERVAL_SECONDS = 1.0
TIMEOUT_SECONDS = 600

# Path to the workflow template (relative to this file's directory)
WORKFLOW_PATH = Path(__file__).parent.parent / "workflow.json"


class ComfyUIError(Exception):
    """Raised when ComfyUI returns an error or times out."""


class ComfyUIProvider:
    """Generates images via a local ComfyUI server using FLUX.1-schnell."""

    def __init__(self, base_url: str = DEFAULT_COMFYUI_URL):
        self.base_url = base_url.rstrip('/')
        self._workflow_template = None

    @property
    def workflow_template(self) -> dict:
        """Load and cache the workflow JSON template."""
        if self._workflow_template is None:
            if not WORKFLOW_PATH.exists():
                raise FileNotFoundError(
                    f"Workflow template not found: {WORKFLOW_PATH}\n"
                    "Please create a ComfyUI API-format workflow JSON."
                )
            with open(WORKFLOW_PATH, 'r', encoding='utf-8') as f:
                self._workflow_template = json.load(f)
        return self._workflow_template

    def _build_prompt_payload(self, prompt_text: str, seed: int) -> dict:
        """Inject prompt text and seed into the workflow template.

        Expects the workflow to have nodes with specific class_type values:
        - CLIPTextEncode (or similar): receives the prompt text
        - KSampler (or similar): receives the seed
        - EmptyLatentImage (or similar): defines image dimensions
        """
        workflow = json.loads(json.dumps(self.workflow_template))  # deep copy

        for node_id, node in workflow.items():
            class_type = node.get("class_type", "")

            # Inject prompt text into text-encoding nodes
            if class_type in ("CLIPTextEncode", "CLIPTextEncodeFlux"):
                if "inputs" in node and "text" in node["inputs"]:
                    node["inputs"]["text"] = prompt_text

            # Inject seed into sampler nodes
            if class_type in ("KSampler", "KSamplerAdvanced", "SamplerCustom"):
                if "inputs" in node:
                    if "seed" in node["inputs"]:
                        node["inputs"]["seed"] = seed
                    if "noise_seed" in node["inputs"]:
                        node["inputs"]["noise_seed"] = seed

            # Ensure 512x512 dimensions on latent image nodes
            if class_type == "EmptyLatentImage":
                if "inputs" in node:
                    node["inputs"]["width"] = 512
                    node["inputs"]["height"] = 512

        return {"prompt": workflow}

    def _queue_prompt(self, payload: dict) -> str:
        """Submit a prompt to ComfyUI and return the prompt_id."""
        url = f"{self.base_url}/prompt"
        try:
            resp = requests.post(url, json=payload, timeout=30)
            resp.raise_for_status()
        except requests.ConnectionError:
            raise ComfyUIError(
                f"Cannot connect to ComfyUI at {self.base_url}. "
                "Is ComfyUI running?"
            )
        except requests.HTTPError as e:
            logger.error("ComfyUI rejected the prompt: %s", e)
            logger.error("Response text: %s", resp.text if 'resp' in locals() else 'No response')
            raise ComfyUIError(f"ComfyUI rejected the prompt: {e}")

        data = resp.json()
        prompt_id = data.get("prompt_id")
        if not prompt_id:
            raise ComfyUIError(f"No prompt_id returned from ComfyUI: {data}")
        return prompt_id

    def _poll_until_done(self, prompt_id: str) -> dict:
        """Poll ComfyUI history until the prompt completes or times out."""
        url = f"{self.base_url}/history/{prompt_id}"
        start = time.time()

        while time.time() - start < TIMEOUT_SECONDS:
            try:
                resp = requests.get(url, timeout=10)
                resp.raise_for_status()
                history = resp.json()
            except (requests.RequestException, ValueError):
                time.sleep(POLL_INTERVAL_SECONDS)
                continue

            if prompt_id in history:
                entry = history[prompt_id]
                status = entry.get("status", {})
                if status.get("completed", False):
                    return entry
                if status.get("status_str") == "error":
                    messages = status.get("messages", [])
                    raise ComfyUIError(f"ComfyUI generation error: {messages}")

            time.sleep(POLL_INTERVAL_SECONDS)

        raise ComfyUIError(
            f"Timed out after {TIMEOUT_SECONDS}s waiting for prompt {prompt_id}"
        )

    def _download_image(self, history_entry: dict, out_path: str) -> None:
        """Extract and download the output image from a completed prompt."""
        outputs = history_entry.get("outputs", {})

        # Find the first image output across all nodes
        for node_id, node_output in outputs.items():
            images = node_output.get("images", [])
            if images:
                image_info = images[0]
                filename = image_info["filename"]
                subfolder = image_info.get("subfolder", "")
                img_type = image_info.get("type", "output")

                params = {"filename": filename, "type": img_type}
                if subfolder:
                    params["subfolder"] = subfolder

                url = f"{self.base_url}/view?{urlencode(params)}"
                resp = requests.get(url, timeout=60)
                resp.raise_for_status()

                # Ensure output directory exists
                os.makedirs(os.path.dirname(out_path), exist_ok=True)

                with open(out_path, 'wb') as f:
                    f.write(resp.content)

                logger.info("Saved image to %s (%d bytes)", out_path, len(resp.content))
                return

        raise ComfyUIError("No image output found in ComfyUI response")

    def generate_image(self, prompt: str, out_path: str, seed: int = 0) -> bool:
        """Generate an image from a text prompt and save to out_path.

        Args:
            prompt: The text prompt for image generation.
            out_path: Filesystem path to save the output PNG.
            seed: Random seed for reproducibility (0 = random).

        Returns:
            True on success, False on failure.
        """
        try:
            payload = self._build_prompt_payload(prompt, seed)
            logger.debug("Sending workflow to ComfyUI:")
            logger.debug(json.dumps(payload, indent=2))
            prompt_id = self._queue_prompt(payload)
            logger.info("Queued prompt %s (seed=%d)", prompt_id, seed)

            history_entry = self._poll_until_done(prompt_id)
            self._download_image(history_entry, out_path)
            return True

        except ComfyUIError as e:
            logger.error("ComfyUI generation failed: %s", e)
            return False
        except Exception as e:
            logger.error("Unexpected error during generation: %s", e)
            return False


def generate_image(prompt: str, out_path: str, seed: int = 0,
                   base_url: str = DEFAULT_COMFYUI_URL) -> bool:
    """Module-level convenience function for image generation."""
    provider = ComfyUIProvider(base_url)
    return provider.generate_image(prompt, out_path, seed)
