from rest_framework.test import APITestCase

from .models import Task

URL = '/api/tasks/'


class TaskApiTests(APITestCase):
    def test_create_with_defaults(self):
        res = self.client.post(URL, {'title': 'Buy milk'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['priority'], 'medium')
        self.assertFalse(res.data['completed'])

    def test_blank_title_rejected(self):
        res = self.client.post(URL, {'title': '   '}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('title', res.data)

    def test_title_is_trimmed(self):
        res = self.client.post(URL, {'title': '  Call mom  '}, format='json')
        self.assertEqual(res.data['title'], 'Call mom')

    def test_invalid_priority_rejected(self):
        res = self.client.post(
            URL, {'title': 'x', 'priority': 'urgent'}, format='json'
        )
        self.assertEqual(res.status_code, 400)

    def test_patch_toggle_completed(self):
        task = Task.objects.create(title='Read')
        res = self.client.patch(
            f'{URL}{task.id}/', {'completed': True}, format='json'
        )
        self.assertEqual(res.status_code, 200)
        task.refresh_from_db()
        self.assertTrue(task.completed)

    def test_delete(self):
        task = Task.objects.create(title='Old')
        res = self.client.delete(f'{URL}{task.id}/')
        self.assertEqual(res.status_code, 204)
        self.assertEqual(Task.objects.count(), 0)

    def test_filter_completed_and_priority(self):
        Task.objects.create(title='a', completed=True, priority='high')
        Task.objects.create(title='b', completed=False, priority='high')
        Task.objects.create(title='c', completed=False, priority='low')
        done = self.client.get(URL, {'completed': 'true'}).data
        self.assertEqual([t['title'] for t in done], ['a'])
        high_open = self.client.get(
            URL, {'completed': 'false', 'priority': 'high'}
        ).data
        self.assertEqual([t['title'] for t in high_open], ['b'])

    def test_search(self):
        Task.objects.create(title='Write report')
        Task.objects.create(title='Gym', description='leg day')
        res = self.client.get(URL, {'search': 'leg'}).data
        self.assertEqual([t['title'] for t in res], ['Gym'])

    def test_clear_completed(self):
        Task.objects.create(title='a', completed=True)
        Task.objects.create(title='b')
        res = self.client.delete(f'{URL}clear-completed/')
        self.assertEqual(res.data['deleted'], 1)
        self.assertEqual(Task.objects.count(), 1)