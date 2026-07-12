import os
import tempfile
import unittest
from unittest.mock import Mock, patch

from services.v1.providers import omni_kie_client


class TestOmniCometClient(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(
            os.environ,
            {
                "COMETAPI_KEY": "test-key",
                "COMETAPI_BASE_URL": "https://api.cometapi.com",
                "COMETAPI_RETRY_ATTEMPTS": "2",
                "COMETAPI_RETRY_DELAY_SECONDS": "0.1",
            },
            clear=False,
        )
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def _response(self, status_code=200, payload=None, text="", headers=None, content=b""):
        response = Mock()
        response.status_code = status_code
        response.text = text
        response.headers = headers or {}
        response.content = content
        response.json.side_effect = None
        response.json.return_value = payload if payload is not None else {}
        return response

    @patch("services.v1.providers.omni_kie_client.requests.request")
    def test_create_video_task_uses_multipart_form(self, request_mock):
        request_mock.return_value = self._response(
            payload={
                "id": "task_1",
                "object": "video",
                "model": "omni-fast",
                "status": "queued",
                "progress": 0,
                "created_at": 1,
            }
        )

        task = omni_kie_client.create_video_task("hello", aspect_ratio="9:16")

        self.assertEqual(task["task_id"], "task_1")
        _, kwargs = request_mock.call_args
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer test-key")
        self.assertIn(("model", (None, "omni-fast")), kwargs["files"])
        self.assertIn(("prompt", (None, "hello")), kwargs["files"])
        self.assertNotIn("json", kwargs)

    @patch("services.v1.providers.omni_kie_client.time.sleep")
    @patch("services.v1.providers.omni_kie_client.requests.request")
    def test_retries_429_with_retry_after(self, request_mock, sleep_mock):
        request_mock.side_effect = [
            self._response(
                status_code=429,
                payload={"error": {"message": "rate limit"}},
                headers={"Retry-After": "2"},
            ),
            self._response(
                payload={
                    "id": "task_2",
                    "object": "video",
                    "model": "omni-fast",
                    "status": "queued",
                    "progress": 0,
                    "created_at": 1,
                }
            ),
        ]

        task = omni_kie_client.create_video_task("hello")

        self.assertEqual(task["task_id"], "task_2")
        self.assertEqual(request_mock.call_count, 2)
        sleep_mock.assert_called_once_with(2.0)

    @patch("services.v1.providers.omni_kie_client.requests.request")
    def test_does_not_retry_bad_request(self, request_mock):
        request_mock.return_value = self._response(
            status_code=400,
            payload={"error": {"message": "bad prompt", "type": "invalid_request_error"}},
        )

        with self.assertRaises(omni_kie_client.CometApiError):
            omni_kie_client.create_video_task("hello")

        self.assertEqual(request_mock.call_count, 1)

    @patch("services.v1.providers.omni_kie_client.requests.request")
    def test_does_not_retry_invalid_request_on_500(self, request_mock):
        request_mock.return_value = self._response(
            status_code=500,
            payload={"error": {"message": "invalid", "code": "invalid_request"}},
            headers={"x-request-id": "req_123"},
        )

        with self.assertRaises(omni_kie_client.CometApiError) as raised:
            omni_kie_client.create_video_task("hello")

        self.assertEqual(request_mock.call_count, 1)
        self.assertEqual(raised.exception.error["request_id"], "req_123")

    @patch("services.v1.providers.omni_kie_client.requests.request")
    def test_download_rejects_non_mp4_content(self, request_mock):
        request_mock.return_value = self._response(
            status_code=200,
            headers={"content-type": "application/json"},
            content=b'{"error":"not ready"}',
        )

        with tempfile.NamedTemporaryFile() as output:
            with self.assertRaises(omni_kie_client.CometApiError):
                omni_kie_client.download_video("task_3", output.name)


if __name__ == "__main__":
    unittest.main()
