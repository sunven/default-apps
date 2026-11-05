import { act, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { Query } from '../bindings/github.com/sunven/default-apps/internal/association/service'
import type { QueryResult } from '../bindings/github.com/sunven/default-apps/internal/association/models'
import App from './App'
import userEvent from '@testing-library/user-event'

vi.mock('../bindings/github.com/sunven/default-apps/internal/association/service', () => ({ Query: vi.fn() }))
const observedAt = '2026-11-05T10:00:00Z'
const observation: QueryResult = {
 association: {kind: 'file', key: 'com.adobe.pdf'}, version: 1,
 default: {known: true, app: {path: '/Volumes/Archive/Reader.app', displayPath: '/Volumes/Archive/Reader.app', name: 'Reader', version: '2.0', bundleID: 'test.reader'}, observedAt, stale: false, error: null},
 candidates: {known: true, apps: [{path: '/Applications/Preview.app', displayPath: '/Applications/Preview.app', name: '预览', version: '11.0', bundleID: 'com.apple.Preview'}], observedAt, stale: false, error: null},
}
beforeEach(() => vi.resetAllMocks())

test('shows the PDF current default and independently returned candidate copies', async () => {
 vi.mocked(Query).mockResolvedValue(observation)
 render(<App />)
 const current=await screen.findByRole('region',{name: '当前默认应用'})
 expect(await within(current).findByText('Reader')).toBeVisible()
 expect(within(current).getByText('/Volumes/Archive/Reader.app')).toBeVisible()
 expect(within(current).getByText('版本 2.0')).toBeVisible()
 const candidates=screen.getByRole('region',{name:'系统候选应用'})
 expect(within(candidates).getByText('预览')).toBeVisible()
 expect(within(candidates).queryByText('Reader')).not.toBeInTheDocument()
})

test('distinguishes a successful missing default from an empty candidate list', async () => {
 vi.mocked(Query).mockResolvedValue({...observation, default: {...observation.default, app: null}, candidates: {...observation.candidates, apps: []}})
 render(<App />)
 expect(await screen.findByText('系统未返回默认应用')).toBeVisible()
 expect(screen.getByText('系统未返回候选应用')).toBeVisible()
 expect(screen.queryByText('正在查询…')).not.toBeInTheDocument()
})

test('refresh keeps the last default visible and marks a failed update while candidates succeed', async () => {
 vi.mocked(Query).mockResolvedValueOnce(observation).mockResolvedValueOnce({...observation, version: 2,
  default: {...observation.default, stale: true, error: {message:'系统服务暂时不可用'}},
  candidates: {...observation.candidates, apps: []},
 })
 render(<App />)
 expect(await screen.findByText('Reader')).toBeVisible()
 await userEvent.click(screen.getByRole('button',{name:'重新查询'}))
 expect(await screen.findByText(/默认应用待更新/)).toBeVisible()
 expect(screen.getByText('Reader')).toBeVisible()
 expect(screen.getByText('系统服务暂时不可用')).toBeVisible()
 expect(screen.getByText('系统未返回候选应用')).toBeVisible()
})

test('shows independent initial errors and allows retry to a valid empty observation', async () => {
 vi.mocked(Query).mockResolvedValueOnce({...observation,
  default: {...observation.default, known:false, app:null, error:{message:'默认查询不可用'}},
  candidates: {...observation.candidates, known:false, apps:[], error:{message:'候选查询不可用'}},
 }).mockResolvedValueOnce({...observation, default:{...observation.default, app:null}, candidates:{...observation.candidates,apps:[]}})
 render(<App />)
 expect(await screen.findByText('默认应用查询失败')).toBeVisible()
 expect(screen.getByText('候选应用查询失败')).toBeVisible()
 expect(screen.queryByText('系统未返回默认应用')).not.toBeInTheDocument()
 await userEvent.click(screen.getByRole('button',{name:'重新查询'}))
 expect(await screen.findByText('系统未返回默认应用')).toBeVisible()
 expect(screen.queryByText('默认应用查询失败')).not.toBeInTheDocument()
})

test('shows loading without inventing an empty default, then retains data during a refresh', async () => {
 let complete!: (value: QueryResult) => void
 const pending = new Promise<QueryResult>(resolve => { complete=resolve })
 vi.mocked(Query).mockReturnValueOnce(pending as ReturnType<typeof Query>)
 render(<App />)
 expect(screen.getByText('正在读取系统默认…')).toBeVisible()
 expect(screen.getByText('正在读取系统候选…')).toBeVisible()
 expect(screen.getByRole('button',{name:'正在查询…'})).toBeDisabled()
 await act(async () => complete(observation))
 const refreshing = new Promise<QueryResult>(resolve => { complete=resolve })
 vi.mocked(Query).mockReturnValueOnce(refreshing as ReturnType<typeof Query>)
 await userEvent.click(screen.getByRole('button',{name:'重新查询'}))
 expect(screen.getByText('Reader')).toBeVisible()
 expect(screen.getByRole('button',{name:'正在查询…'})).toBeDisabled()
 await act(async () => complete({...observation,version:2}))
 expect(screen.getByRole('button',{name:'重新查询'})).toBeEnabled()
})

test('keyboard users can focus the scrollable results after the refresh control', async () => {
 vi.mocked(Query).mockResolvedValue(observation)
 render(<App />)
 await screen.findByText('Reader')
 await userEvent.tab()
 expect(screen.getByRole('button',{name:'重新查询'})).toHaveFocus()
 await userEvent.tab()
 expect(screen.getByRole('region',{name:'PDF 查询结果'})).toHaveFocus()
})
