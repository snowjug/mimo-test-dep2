import {
  DashboardOverviewData,
  DashboardKPIs,
  RevenueTrendPoint,
  FulfillmentStats,
  NeedsAttentionItem,
  KioskSummary,
  LiveOperationItem,
  MIMOIntelligenceInsight,
  IncidentsSummary,
} from '../types/dashboard.types';
import { mockDashboardOverview } from '../mocks/dashboard.mock';

export class DashboardService {
  /**
   * Retrieves full aggregated overview data for the Dashboard
   */
  public async getDashboardOverview(): Promise<DashboardOverviewData> {
    return Promise.resolve(mockDashboardOverview);
  }

  /**
   * Retrieves KPI summary cards
   */
  public async getKPIs(): Promise<DashboardKPIs> {
    return Promise.resolve(mockDashboardOverview.kpis);
  }

  /**
   * Retrieves Revenue Trends historical chart series
   */
  public async getRevenueTrends(): Promise<RevenueTrendPoint[]> {
    return Promise.resolve(mockDashboardOverview.revenueTrends);
  }

  /**
   * Retrieves Paid Page Fulfillment statistics
   */
  public async getFulfillmentStats(): Promise<FulfillmentStats> {
    return Promise.resolve(mockDashboardOverview.fulfillment);
  }

  /**
   * Retrieves items requiring operator attention
   */
  public async getNeedsAttention(): Promise<NeedsAttentionItem[]> {
    return Promise.resolve(mockDashboardOverview.needsAttention);
  }

  /**
   * Retrieves summary of kiosk fleet entities
   */
  public async getKioskNetwork(): Promise<KioskSummary[]> {
    return Promise.resolve(mockDashboardOverview.kiosks);
  }

  /**
   * Retrieves live print operations queue
   */
  public async getLiveOperations(): Promise<LiveOperationItem[]> {
    return Promise.resolve(mockDashboardOverview.liveOperations);
  }

  /**
   * Retrieves executive intelligence insights
   */
  public async getIntelligenceInsights(): Promise<MIMOIntelligenceInsight[]> {
    return Promise.resolve(mockDashboardOverview.intelligence);
  }

  /**
   * Retrieves incident summary counts
   */
  public async getIncidentsSummary(): Promise<IncidentsSummary> {
    return Promise.resolve(mockDashboardOverview.incidents);
  }
}

export const dashboardService = new DashboardService();
